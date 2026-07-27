/* ============================================================
   Next Cube Pro -- cloud sync engine
   Merge-by-id with tombstones, so signing in on a second device
   never overwrites/loses solves -- it combines both.

   HOW IT WORKS
   - Every solve/session already has a stable unique `id` (set at
     creation) plus a timestamp. Merge = union of both sides by id.
   - Deleting a solve/session doesn't just remove it locally -- its
     id also gets recorded in a tombstone list (see SyncTombstones
     below), so a merge never resurrects something you deleted on
     purpose, even if an older copy of it still exists elsewhere.
   - Editing a solve (DNF/+2/manual edit) stamps `updatedAt`. If the
     same solve id was edited differently on two devices, the merge
     keeps whichever edit has the newer `updatedAt`.

   WHAT'S LEFT TO WIRE UP (marked with TODO below)
   - CloudSync.pull() / CloudSync.push() are stubs that do nothing
     yet. Once Firebase (or whatever backend) is connected, fill
     these in to read/write the signed-in user's data in Firestore.
     Everything else (the merge logic, the local save, the tombstone
     bookkeeping) is already wired and will "just work" as soon as
     those two functions talk to a real backend.
   ============================================================ */

// ---- Tombstones: remember what was intentionally deleted -------------
const SyncTombstones = {
    addDeletedSolve(id) {
        if (!id) return;
        const list = AppStorage.getJSON('deletedSolveIds', []);
        list.push({ id, deletedAt: Date.now() });
        AppStorage.setJSON('deletedSolveIds', list);
    },
    addDeletedSession(id) {
        if (!id) return;
        const list = AppStorage.getJSON('deletedSessionIds', []);
        list.push({ id, deletedAt: Date.now() });
        AppStorage.setJSON('deletedSessionIds', list);
    },
    getDeletedSolveIds() {
        return new Set(AppStorage.getJSON('deletedSolveIds', []).map(x => x.id));
    },
    getDeletedSessionIds() {
        return new Set(AppStorage.getJSON('deletedSessionIds', []).map(x => x.id));
    },

    // Raw entries (with deletedAt) -- this is what gets pushed to Firestore,
    // so other devices learn about deletions that happened on this one.
    getDeletedSolveEntries() {
        return AppStorage.getJSON('deletedSolveIds', []);
    },
    getDeletedSessionEntries() {
        return AppStorage.getJSON('deletedSessionIds', []);
    },

    // Fold tombstones that came from Firestore into this device's local
    // list (union by id). Without this, a deletion made on device A would
    // never be recognized by device B's merge, and would get resurrected
    // the moment B's local (still-has-it) copy gets merged back in.
    mergeRemoteSolveTombstones(remoteEntries) {
        const local = AppStorage.getJSON('deletedSolveIds', []);
        const byId = new Map(local.map(e => [e.id, e]));
        for (const e of (remoteEntries || [])) {
            if (!byId.has(e.id)) byId.set(e.id, e);
        }
        const merged = Array.from(byId.values());
        AppStorage.setJSON('deletedSolveIds', merged);
        return merged;
    },
    mergeRemoteSessionTombstones(remoteEntries) {
        const local = AppStorage.getJSON('deletedSessionIds', []);
        const byId = new Map(local.map(e => [e.id, e]));
        for (const e of (remoteEntries || [])) {
            if (!byId.has(e.id)) byId.set(e.id, e);
        }
        const merged = Array.from(byId.values());
        AppStorage.setJSON('deletedSessionIds', merged);
        return merged;
    }
};

// ---- Merge logic (pure, no network -- safe to test standalone) -------
const SyncMerge = {
    // Merge two solve arrays (order doesn't matter, both are id-keyed),
    // dropping anything in deletedSolveIds and keeping the most
    // recently updated version of any solve that exists on both sides.
    mergeSolves(localSolves, remoteSolves, deletedSolveIds) {
        const byId = new Map();
        for (const solve of (localSolves || [])) byId.set(solve.id, solve);
        for (const solve of (remoteSolves || [])) {
            const existing = byId.get(solve.id);
            if (!existing) {
                byId.set(solve.id, solve);
            } else {
                const existingStamp = existing.updatedAt || existing.timestamp || 0;
                const incomingStamp = solve.updatedAt || solve.timestamp || 0;
                if (incomingStamp > existingStamp) byId.set(solve.id, solve);
            }
        }
        for (const id of deletedSolveIds) byId.delete(id);

        return Array.from(byId.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    },

    // Merge two session dictionaries (keyed by session id).
    mergeSessions(localSessions, remoteSessions, deletedSessionIds, deletedSolveIds) {
        const merged = {};
        const allIds = new Set([
            ...Object.keys(localSessions || {}),
            ...Object.keys(remoteSessions || {})
        ]);

        for (const id of allIds) {
            if (deletedSessionIds.has(id)) continue;

            const local = (localSessions || {})[id];
            const remote = (remoteSessions || {})[id];

            if (local && remote) {
                merged[id] = {
                    ...remote,
                    ...local, // local metadata (name, discipline edits) wins on conflict
                    solves: SyncMerge.mergeSolves(local.solves, remote.solves, deletedSolveIds)
                };
            } else {
                merged[id] = local || remote;
            }
        }
        return merged;
    }
};

// ---- Cloud read/write -- talks to Firestore via firebase-init.js's CubeSync
const CloudSync = {
    async pull() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return null;
        try {
            const data = await window.CubeSync.loadUserData();
            return (data && data.syncData) ? data.syncData : null;
        } catch (e) {
            console.error('CloudSync.pull failed:', e);
            return null;
        }
    },
    async push(data) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
        try {
            await window.CubeSync.saveUserData({ syncData: data });
        } catch (e) {
            console.error('CloudSync.push failed:', e);
        }
    }
};

// ---- Orchestration ------------------------------------------------------
const AppSync = {
    // Call this right after a successful login (and optionally after
    // every solve, if you want near-live sync across open devices).
    async runSync() {
        const remote = await CloudSync.pull();
        const timer = window.timer;
        if (!timer) return;

        // Fold in tombstones from Firestore FIRST -- otherwise a solve/session
        // deleted on another device looks, from this device's point of view,
        // just like a solve/session it never heard was deleted, and the
        // union-merge below would resurrect it.
        if (remote) {
            SyncTombstones.mergeRemoteSolveTombstones(remote.deletedSolveIds);
            SyncTombstones.mergeRemoteSessionTombstones(remote.deletedSessionIds);
        }

        const deletedSessionIds = SyncTombstones.getDeletedSessionIds();
        const deletedSolveIds = SyncTombstones.getDeletedSolveIds();

        const mergedSessions = remote
            ? SyncMerge.mergeSessions(timer.sessions, remote.sessions, deletedSessionIds, deletedSolveIds)
            : timer.sessions;

        timer.sessions = mergedSessions;
        if (!mergedSessions[timer.currentSessionId] && remote?.currentSessionId) {
            timer.currentSessionId = remote.currentSessionId;
        }
        timer.saveSessions();
        timer.renderSessionsList?.();
        timer.updateSessionDetails?.();
        timer.updateUI();

        await CloudSync.push({
            sessions: mergedSessions,
            currentSessionId: timer.currentSessionId,
            deletedSolveIds: SyncTombstones.getDeletedSolveEntries(),
            deletedSessionIds: SyncTombstones.getDeletedSessionEntries()
        });
    }
};

// ---- Live autosync: push after every local change ------------------------
// Called from Timer.saveSessions() -- i.e. after every solve, DNF, +2,
// delete, edit, or session change. Debounced so several rapid saves
// (e.g. delete + re-render) collapse into a single network write.
// Deliberately does NOT pull/merge -- this device already has the
// freshest state after its own edit; a full AppSync.runSync() (with
// pull) still happens on every sign-in, which is when merging
// against another device's changes actually matters.
let _autoPushTimer = null;
function queueAutoPush(getData) {
    if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
    clearTimeout(_autoPushTimer);
    _autoPushTimer = setTimeout(() => {
        CloudSync.push(getData()).catch(e => console.error('Auto-sync push failed:', e));
    }, 800);
}
window.queueAutoPush = queueAutoPush;

window.SyncTombstones = SyncTombstones;
window.SyncMerge = SyncMerge;
window.CloudSync = CloudSync;
window.AppSync = AppSync;

// ---- Auth error messages -------------------------------------------------
// Maps Firebase Auth error codes to a friendly, translated message.
// Use like: showErr(window.authFirebaseErrorMessage(error.code, getLang()))
// once real sign-in/sign-up calls are wired into the auth buttons.
function authFirebaseErrorMessage(code, lang) {
    const t = translations[lang || getLang()];
    switch (code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return t.authErrWrongPassword;
        case 'auth/user-not-found':
            return t.authErrUserNotFound;
        case 'auth/email-already-in-use':
            return t.authErrEmailInUse;
        case 'auth/invalid-email':
            return t.authErrEmailFormat;
        case 'auth/weak-password':
            return t.authErrPasswordShort;
        case 'auth/too-many-requests':
            return t.authErrTooManyRequests;
        default:
            return t.authErrGeneric;
    }
}

window.authFirebaseErrorMessage = authFirebaseErrorMessage;