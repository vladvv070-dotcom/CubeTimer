/* ============================================================
   Next Cube Pro -- cloud sync engine
   Merge-by-id with tombstones, so signing in on a second device
   never overwrites/loses solves -- it combines both.

   HOW IT WORKS (per-solve model, not one big blob)
   - Firestore layout: users/{uid} holds only small, rarely-changing
     metadata (nickname, email, session names/disciplines, current
     session id). The actual solve history lives one-document-per-solve
     in users/{uid}/solves/{solveId}, plus users/{uid}/tombstones/{id}
     for deletions.
   - The FULL solve history is only ever read from Firestore once,
     right after sign-in (AppSync.runSync). After that, every local
     change (new solve, DNF/+2/edit, delete) pushes exactly ONE
     Firestore write/update/delete for that single solve -- never a
     re-read, never a re-upload of the whole history. This is what
     keeps a heavy user (thousands of solves) from burning through
     the daily read/write quota in a session or two.
   - Stats (Ao5/Ao12/Ao100, best, charts) are always computed from
     the in-memory `timer.sessions[...].solves` array -- never by
     querying Firestore. That was already true before this file was
     rewritten and remains true here; this file only changes how
     solves get in and out of Firestore, not how they're read for
     display.
   - Deleting a solve doesn't just remove it locally -- its id also
     gets recorded in a tombstone (see SyncTombstones below), so a
     merge never resurrects something you deleted on purpose, even
     if an older copy of it still exists elsewhere.
   - Editing a solve (DNF/+2/manual edit) stamps `updatedAt`. If the
     same solve id was edited differently on two devices, the merge
     (at next sign-in) keeps whichever edit has the newer `updatedAt`.
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

    // Raw entries (with deletedAt) -- used locally for filtering merges.
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

    // Merge two session metadata dictionaries (keyed by session id).
    // Solves are NOT part of this anymore -- they're merged separately
    // via mergeSolves, keyed by their own sessionId field, since they
    // now live in a flat Firestore subcollection rather than nested
    // inside each session's blob.
    mergeSessionsMeta(localSessions, remoteSessions, deletedSessionIds) {
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
                // local metadata (name, discipline edits) wins on conflict;
                // solves get overwritten below once mergeSolves runs.
                merged[id] = { ...remote, ...local, solves: local.solves || remote.solves || [] };
            } else {
                merged[id] = local || remote;
            }
        }
        return merged;
    }
};

// ---- Cloud read/write -- talks to Firestore via firebase-init.js's CubeSync
const CloudSync = {
    // Metadata only (nickname, session names/disciplines, current session
    // id) -- small, rarely-changing document. NOT the solve history.
    async pullMeta() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return null;
        try {
            return await window.CubeSync.loadUserData();
        } catch (e) {
            console.error('CloudSync.pullMeta failed:', e);
            return null;
        }
    },
    async pushMeta(meta) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
        try {
            await window.CubeSync.saveSessionsMeta(meta);
        } catch (e) {
            console.error('CloudSync.pushMeta failed:', e);
        }
    },

    // The ENTIRE solve history, read exactly once (called only from
    // AppSync.runSync, i.e. once per sign-in / page load with a
    // restored session -- never on a per-solve basis).
    async pullAllSolvesOnce() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return { solves: [], tombstones: [] };
        try {
            return await window.CubeSync.loadAllSolvesOnce();
        } catch (e) {
            console.error('CloudSync.pullAllSolvesOnce failed:', e);
            return { solves: [], tombstones: [] };
        }
    },

    // Point writes -- exactly one Firestore operation each, no re-read
    // of the rest of the history.
    async pushNewSolve(sessionId, solve) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
        try {
            await window.CubeSync.saveSolve(sessionId, solve);
        } catch (e) {
            console.error('CloudSync.pushNewSolve failed:', e);
        }
    },
    async pushSolveUpdate(solveId, patch) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
        try {
            await window.CubeSync.updateSolve(solveId, patch);
        } catch (e) {
            console.error('CloudSync.pushSolveUpdate failed:', e);
        }
    },
    async pushSolveDelete(solveId) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
        try {
            await window.CubeSync.deleteSolveRemote(solveId);
        } catch (e) {
            console.error('CloudSync.pushSolveDelete failed:', e);
        }
    }
};

// ---- Orchestration ------------------------------------------------------
const AppSync = {
    // Call this right after a successful login, and once on page load if
    // a session was restored. This is the ONLY place the full solve
    // history gets read from Firestore -- every subsequent solve add/
    // edit/delete uses the point-write functions below instead.
    async runSync() {
        const timer = window.timer;
        if (!timer) return;

        const user = window.CubeAuth?.getCurrentUser?.();
        if (!user) return;

        // Local tombstones and the local sessions cache live in this browser's
        // localStorage, which is NOT scoped to a Firebase account -- it's just
        // "whatever this device last had". If the signed-in uid is different
        // from the one this device last synced (new account, switched
        // account, account was deleted and recreated, etc.), that local cache
        // -- deletion markers especially -- belongs to a DIFFERENT identity
        // and must not be trusted. Left alone, a stale "session X was
        // deleted" tombstone from a previous account would get unioned into
        // the new account's cloud tombstone list and then propagate to every
        // other device, which would honor it and hide their own real,
        // never-deleted sessions. This is what caused sessions to vanish
        // across every device after switching accounts.
        const lastSyncedUid = AppStorage.getRaw('lastSyncedUid');
        if (lastSyncedUid && lastSyncedUid !== user.uid) {
            AppStorage.setJSON('deletedSolveIds', []);
            AppStorage.setJSON('deletedSessionIds', []);
            timer.sessions = {};
        }
        AppStorage.setRaw('lastSyncedUid', user.uid);

        const [remoteMeta, remoteHistory] = await Promise.all([
            CloudSync.pullMeta(),
            CloudSync.pullAllSolvesOnce()
        ]);

        // Fold in tombstones from Firestore FIRST -- otherwise a solve/session
        // deleted on another device looks, from this device's point of view,
        // just like a solve/session it never heard was deleted, and the
        // union-merge below would resurrect it.
        if (remoteMeta) {
            SyncTombstones.mergeRemoteSessionTombstones(remoteMeta.deletedSessionIds);
        }
        SyncTombstones.mergeRemoteSolveTombstones(remoteHistory.tombstones);

        const deletedSessionIds = SyncTombstones.getDeletedSessionIds();
        const deletedSolveIds = SyncTombstones.getDeletedSolveIds();

        // Merge session metadata (names/disciplines), solves temporarily empty.
        const mergedSessions = remoteMeta
            ? SyncMerge.mergeSessionsMeta(timer.sessions, remoteMeta.sessions, deletedSessionIds)
            : { ...timer.sessions };

        // Group the flat remote solve list by sessionId, then merge each
        // session's local solves against its remote solves.
        const remoteSolvesBySession = {};
        for (const solve of remoteHistory.solves) {
            const sid = solve.sessionId || 'no-session';
            (remoteSolvesBySession[sid] = remoteSolvesBySession[sid] || []).push(solve);
        }

        const localSolvesNotYetRemote = []; // solves that exist locally (or only in the legacy embedded field) but never made it to the new subcollection
        for (const sessionId of Object.keys(mergedSessions)) {
            if (deletedSessionIds.has(sessionId)) continue;
            const localSolves = timer.sessions[sessionId]?.solves || [];
            const remoteSolves = remoteSolvesBySession[sessionId] || [];
            // Backward-compat: sessions created before the subcollection rewrite
            // may still have their solves sitting in the OLD embedded field
            // (remote.sessions[id].solves from the metadata doc). Treat that as
            // a third merge source instead of silently discarding it -- this is
            // exactly what went missing on the phone.
            const legacySolves = (remoteMeta?.sessions?.[sessionId]?.solves) || [];

            const solvesWithLegacy = SyncMerge.mergeSolves(localSolves, legacySolves, deletedSolveIds);
            mergedSessions[sessionId].solves = SyncMerge.mergeSolves(solvesWithLegacy, remoteSolves, deletedSolveIds);

            const remoteIds = new Set(remoteSolves.map(s => s.id));
            for (const solve of mergedSessions[sessionId].solves) {
                if (!remoteIds.has(solve.id) && !deletedSolveIds.has(solve.id)) {
                    localSolvesNotYetRemote.push({ sessionId, solve });
                }
            }
        }

        timer.sessions = mergedSessions;
        if (!mergedSessions[timer.currentSessionId] && remoteMeta?.currentSessionId) {
            timer.currentSessionId = remoteMeta.currentSessionId;
        }
        timer.saveSessions();
        timer.renderSessionsList?.();
        timer.updateSessionDetails?.();
        timer.updateUI();

        // Keep the header's "logged in as ..." nickname fresh after a
        // restored session (login/register/Google-login already set this
        // themselves right after auth, so this mainly covers page reloads).
        if (remoteMeta?.nickname) {
            AppStorage.setJSON('authUser', { uid: user.uid, nickname: remoteMeta.nickname, email: user.email });
        }

        // Push metadata once if it changed, and backfill any solves that
        // were created locally but never reached Firestore (e.g. made
        // while offline, or before the very first sign-in on this device).
        // This is a one-time catch-up, not a recurring re-upload of
        // everything -- each solve is still exactly one write.
        AppSync.pushSessionsMetaNow();
        for (const { sessionId, solve } of localSolvesNotYetRemote) {
            await CloudSync.pushNewSolve(sessionId, solve);
        }
    },

    // ---- Point-write helpers, called directly from Timer on each action ----
    pushNewSolve(sessionId, solve) {
        CloudSync.pushNewSolve(sessionId, solve);
    },
    pushSolveUpdate(solveId, patch) {
        CloudSync.pushSolveUpdate(solveId, patch);
    },
    pushSolveDelete(solveId) {
        CloudSync.pushSolveDelete(solveId);
    },

    // Metadata (session names/disciplines/current session) is small and
    // changes rarely, so it's fine to push it as a whole -- debounced the
    // same way the old blob push was, just without the solve history
    // riding along with it.
    pushSessionsMetaNow() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
        const timer = window.timer;
        if (!timer) return;
        const sessionsMeta = {};
        for (const [id, session] of Object.entries(timer.sessions)) {
            const { solves, ...meta } = session; // eslint-disable-line no-unused-vars
            sessionsMeta[id] = meta;
        }
        CloudSync.pushMeta({
            sessions: sessionsMeta,
            currentSessionId: timer.currentSessionId,
            deletedSessionIds: SyncTombstones.getDeletedSessionEntries()
        });
    }
};

// ---- Live autosync of METADATA ONLY: push after session-level changes --
// Called from Timer.saveSessions() -- session create/rename/delete,
// discipline change, session switch, etc. Debounced so several rapid
// changes collapse into a single small write. Deliberately excludes the
// solves array now (that's not what changed here in the common case,
// and per-solve actions push themselves individually via the functions
// above) -- this is the whole point of the rewrite: no more re-uploading
// the entire solve history on every save.
let _metaPushTimer = null;
function queueAutoPush() {
    if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return;
    clearTimeout(_metaPushTimer);
    _metaPushTimer = setTimeout(() => {
        AppSync.pushSessionsMetaNow();
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