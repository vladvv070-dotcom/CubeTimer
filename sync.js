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
   - The FULL solve history is only ever read from Firestore once per
     account+device -- the very first time AppSync.runSync() runs with
     no local "lastSyncedAt" marker yet. Every sync after that (which,
     since Firebase restores the session on every page load, means
     basically every visit) pulls a DELTA instead: only solves/
     tombstones with updatedAt/deletedAt newer than the marker
     (CloudSync.pullSolvesDelta / CubeSync.loadSolvesSince in
     firebase-init.js). This is what keeps a heavy user (thousands of
     solves) from re-reading their entire history, and therefore
     burning through the daily read quota, on every single page load --
     read cost now tracks how much actually changed since last visit,
     not how much history has piled up. Writes were already point
     writes (new solve, DNF/+2/edit, delete = exactly one Firestore
     write/update/delete each) and remain so.
   - Anything that fails to push (offline, transient error) is queued
     in PendingSync and retried at the top of the next runSync(), since
     a delta sync can no longer notice "missing" solves by diffing
     against the full remote list the way a full sync can.
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

// ---- Pending push queue: solves whose write to Firestore failed --------
// (offline, transient network error, etc.). Now that runSync() no longer
// re-reads the full remote history on every page load (see loadSolvesSince
// below), it can't rely on "diff local against full remote list" to catch
// solves that silently failed to upload. Instead, every push failure gets
// queued here and retried once at the very start of the next runSync(),
// regardless of whether that sync ends up being a full or delta pull.
const PendingSync = {
    getPendingSolves() {
        return AppStorage.getJSON('pendingSolveIds', []); // [{ sessionId, id }]
    },
    addPendingSolve(sessionId, id) {
        if (!id) return;
        const list = PendingSync.getPendingSolves();
        if (!list.some(e => e.id === id)) {
            list.push({ sessionId, id });
            AppStorage.setJSON('pendingSolveIds', list);
        }
    },
    removePendingSolve(id) {
        const list = PendingSync.getPendingSolves();
        const next = list.filter(e => e.id !== id);
        if (next.length !== list.length) AppStorage.setJSON('pendingSolveIds', next);
    },
    getPendingDeletes() {
        return AppStorage.getJSON('pendingDeleteIds', []); // [id, ...]
    },
    addPendingDelete(id) {
        if (!id) return;
        const list = PendingSync.getPendingDeletes();
        if (!list.includes(id)) {
            list.push(id);
            AppStorage.setJSON('pendingDeleteIds', list);
        }
    },
    removePendingDelete(id) {
        const list = PendingSync.getPendingDeletes();
        const next = list.filter(x => x !== id);
        if (next.length !== list.length) AppStorage.setJSON('pendingDeleteIds', next);
    },
    clearAll() {
        AppStorage.setJSON('pendingSolveIds', []);
        AppStorage.setJSON('pendingDeleteIds', []);
    }
};

// Finds which local session currently holds a given solve id. Used only
// to know where to re-read a solve's current state from when retrying a
// failed update push (pure local lookup, no network, no Firestore cost).
function findSessionIdForSolve(solveId) {
    const sessions = window.timer?.sessions || {};
    for (const [sid, session] of Object.entries(sessions)) {
        if ((session.solves || []).some(s => s.id === solveId)) return sid;
    }
    return null;
}

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
            if (merged[id]) merged[id].id = id;
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
            throw e;
        }
    },
    async pushMeta(meta) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return false;
        try {
            await window.CubeSync.saveSessionsMeta(meta);
            return true;
        } catch (e) {
            console.error('CloudSync.pushMeta failed:', e);
            return false;
        }
    },

    // The ENTIRE solve history. Only called when there's no local
    // "lastSyncedAt" marker yet for this account on this device -- i.e.
    // the very first sync, ever, per device+account. After that, every
    // subsequent sync uses pullSolvesDelta below instead.
    async pullAllSolvesOnce() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return { solves: [], tombstones: [] };
        try {
            return await window.CubeSync.loadAllSolvesOnce();
        } catch (e) {
            console.error('CloudSync.pullAllSolvesOnce failed:', e);
            throw e;
        }
    },

    // Only what changed (created/edited/deleted) since sinceTimestamp.
    // This is what keeps read cost tied to recent activity instead of
    // to the total accumulated history -- a user with 10,000 solves who
    // last synced an hour ago still only costs a handful of reads.
    async pullSolvesDelta(sinceTimestamp) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return { solves: [], tombstones: [] };
        try {
            return await window.CubeSync.loadSolvesSince(sinceTimestamp);
        } catch (e) {
            console.error('CloudSync.pullSolvesDelta failed:', e);
            throw e;
        }
    },

    // Point writes -- exactly one Firestore operation each, no re-read
    // of the rest of the history. Failures get queued in PendingSync and
    // retried at the top of the next runSync(), so a delta sync doesn't
    // need to scan the full remote history to notice something never
    // made it up (e.g. the write happened while offline).
    async pushNewSolve(sessionId, solve) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) {
            PendingSync.addPendingSolve(sessionId, solve.id);
            return false;
        }
        try {
            await window.CubeSync.saveSolve(sessionId, solve);
            PendingSync.removePendingSolve(solve.id);
            return true;
        } catch (e) {
            console.error('CloudSync.pushNewSolve failed:', e);
            PendingSync.addPendingSolve(sessionId, solve.id);
            window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'error', code: e?.code || 'solve-write-failed' } }));
            return false;
        }
    },
    async pushSolveUpdate(solveId, patch) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) {
            const sessionId = findSessionIdForSolve(solveId);
            if (sessionId) PendingSync.addPendingSolve(sessionId, solveId);
            return false;
        }
        try {
            await window.CubeSync.updateSolve(solveId, patch);
            PendingSync.removePendingSolve(solveId);
            return true;
        } catch (e) {
            console.error('CloudSync.pushSolveUpdate failed:', e);
            const sessionId = findSessionIdForSolve(solveId);
            if (sessionId) PendingSync.addPendingSolve(sessionId, solveId);
            window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'error', code: e?.code || 'solve-update-failed' } }));
            return false;
        }
    },
    async pushSolveDelete(solveId) {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) {
            PendingSync.addPendingDelete(solveId);
            PendingSync.removePendingSolve(solveId);
            return false;
        }
        try {
            await window.CubeSync.deleteSolveRemote(solveId);
            PendingSync.removePendingDelete(solveId);
            PendingSync.removePendingSolve(solveId); // no longer relevant if it was also queued as a pending create/update
            return true;
        } catch (e) {
            console.error('CloudSync.pushSolveDelete failed:', e);
            PendingSync.addPendingDelete(solveId);
            window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'error', code: e?.code || 'solve-delete-failed' } }));
            return false;
        }
    }
};

// Retries anything queued in PendingSync -- called once at the very
// start of runSync(), before deciding full vs. delta pull. Bounded by
// how many pushes actually failed (normally zero), not by history size.
async function flushPendingSync() {
    const timer = window.timer;
    if (!timer) return;

    for (const { sessionId, id } of PendingSync.getPendingSolves()) {
        const solve = (timer.sessions[sessionId]?.solves || []).find(s => s.id === id);
        if (!solve) {
            // No longer exists locally (e.g. deleted meanwhile) -- nothing to retry.
            PendingSync.removePendingSolve(id);
            continue;
        }
        if (!(await CloudSync.pushNewSolve(sessionId, solve))) throw Object.assign(new Error('Pending solve write failed'), { code: 'solve-write-failed' });
    }

    for (const id of PendingSync.getPendingDeletes()) {
        if (!(await CloudSync.pushSolveDelete(id))) throw Object.assign(new Error('Pending delete failed'), { code: 'solve-delete-failed' });
    }
}

// ---- Orchestration ------------------------------------------------------
let _customPhrasesUnsubscribe = null;

const AppSync = {
    _requestedSync: null,
    requestSync() {
        if (this._requestedSync) return this._requestedSync;
        window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'syncing' } }));
        this._requestedSync = Promise.resolve()
            .then(() => this.runSync())
            .then(() => window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'synced', at: Date.now() } })))
            .catch(error => {
                console.error('Automatic sync failed:', error);
                window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'error', code: error?.code || 'unknown' } }));
            })
            .finally(() => { this._requestedSync = null; });
        return this._requestedSync;
    },
    // Call this right after a successful login, and once on page load if
    // a session was restored. The FULL solve history is only ever read
    // here once per account+device (when there's no local "lastSyncedAt"
    // marker yet) -- every sync after that pulls only what changed since
    // the marker (see pullSolvesDelta), so read cost stops scaling with
    // how much history a user has piled up and instead tracks how much
    // actually changed since they were last here. Every solve add/edit/
    // delete still uses the point-write functions below, same as before.
    async runSync() {
        const timer = window.timer;
        if (!timer) return;

        const user = window.CubeAuth?.getCurrentUser?.();
        if (!user) return;

        // A recoverable local snapshot is written before any cloud merge or
        // account switch can replace the in-memory session map.
        const safetyBackup = JSON.parse(JSON.stringify(timer.sessions || {}));
        const safetySolveCount = Object.values(safetyBackup).reduce((sum, session) => sum + (Array.isArray(session?.solves) ? session.solves.length : 0), 0);
        const previousBackupInfo = AppStorage.getJSON('cubeTimerSessionsSafetyBackupInfo', {}) || {};
        if (safetySolveCount >= Number(previousBackupInfo.solveCount || 0)) {
            if (!AppStorage.setJSON('cubeTimerSessionsSafetyBackup', safetyBackup)) {
                throw Object.assign(new Error('Could not create local safety backup'), { code: 'backup-failed' });
            }
            AppStorage.setJSON('cubeTimerSessionsSafetyBackupInfo', {
                uid: user.uid,
                createdAt: Date.now(),
                solveCount: safetySolveCount
            });
        }

        // v3 uses Firestore server timestamps. Client clocks can differ by
        // hours without making synchronization one-directional.
        const syncProtocolVersion = '5';
        if (AppStorage.getRaw('syncProtocolVersion') !== syncProtocolVersion) {
            AppStorage.setRaw('lastSyncedAt', '');
            AppStorage.setRaw('cloudSyncCursorV3', '');
            AppStorage.setRaw('cloudSyncInitializedV3', '');
        }

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
            PendingSync.clearAll();
            // A different account has never had a delta baseline on this
            // device -- force the full-read path below instead of trying
            // to diff against the previous account's marker.
            AppStorage.setRaw('lastSyncedAt', '');
            AppStorage.setRaw('cloudSyncCursorV3', '');
            AppStorage.setRaw('cloudSyncInitializedV3', '');
            // Preserve the visible local history. It is protected by the
            // safety snapshot above and will be union-merged with the newly
            // signed-in account instead of being erased on an auth transition.
            if (window.commentary?.setCustomPhrases) {
                window.commentary.setCustomPhrases({}, 0);
            } else {
                AppStorage.setJSON('customPhrases', {});
                AppStorage.setRaw('customPhrasesUpdatedAt', '0');
            }
            window.progression?.clearLocalState?.();
        }
        AppStorage.setRaw('lastSyncedUid', user.uid);

        // Retry anything that failed to push last time, before pulling --
        // this is what stands in for the old "scan the full remote list to
        // find what's missing" backfill now that a normal sync no longer
        // reads the full remote list.
        await flushPendingSync();

        const cloudCursor = Number(AppStorage.getRaw('cloudSyncCursorV3')) || 0;
        const isFullSync = AppStorage.getRaw('cloudSyncInitializedV3') !== '1';

        const [remoteMeta, remoteHistory] = await Promise.all([
            CloudSync.pullMeta(),
            isFullSync ? CloudSync.pullAllSolvesOnce() : CloudSync.pullSolvesDelta(cloudCursor)
        ]);

        // Custom commentary phrases are small account metadata. Use a
        // last-write-wins timestamp so additions and deletions made on one
        // device are reflected on every other signed-in device.
        const localCustomPhrases = AppStorage.getJSON('customPhrases', {});
        const localCustomPhrasesUpdatedAt = Number(AppStorage.getRaw('customPhrasesUpdatedAt', '0')) || 0;
        const remoteCustomPhrasesUpdatedAt = Number(remoteMeta?.customPhrasesUpdatedAt) || 0;
        let shouldPushCustomPhrases = localCustomPhrasesUpdatedAt > remoteCustomPhrasesUpdatedAt;

        if (remoteMeta?.customPhrases && remoteCustomPhrasesUpdatedAt >= localCustomPhrasesUpdatedAt) {
            if (window.commentary?.setCustomPhrases) {
                window.commentary.setCustomPhrases(remoteMeta.customPhrases, remoteCustomPhrasesUpdatedAt || Date.now());
            } else {
                AppStorage.setJSON('customPhrases', remoteMeta.customPhrases);
                AppStorage.setRaw('customPhrasesUpdatedAt', String(remoteCustomPhrasesUpdatedAt || Date.now()));
            }
            shouldPushCustomPhrases = false;
        }
        if (remoteMeta?.progressionState) window.progression?.mergeCloudState?.(remoteMeta.progressionState);

        // Fold in tombstones from Firestore FIRST -- otherwise a solve/session
        // deleted on another device looks, from this device's point of view,
        // just like a solve/session it never heard was deleted, and the
        // union-merge below would resurrect it. mergeRemote*Tombstones unions
        // into the already-cumulative local list, so passing only the DELTA
        // tombstones here (in the non-full-sync case) is correct -- previously
        // known tombstones are already folded in from earlier syncs.
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
        // session's local solves against its remote solves. In delta mode
        // this remote list is just what changed -- mergeSolves still does
        // the right thing against local's full cached state (already
        // persisted from the previous sync via timer.saveSessions()):
        // anything not touched by this delta simply passes through
        // untouched, anything new/edited gets folded in, anything now
        // tombstoned gets dropped.
        const remoteSolvesBySession = {};
        for (const solve of remoteHistory.solves) {
            const sid = solve.sessionId || 'no-session';
            (remoteSolvesBySession[sid] = remoteSolvesBySession[sid] || []).push(solve);
        }

        // A point-written solve can exist even if the small parent metadata
        // write was interrupted. Never discard that history just because the
        // session descriptor is temporarily absent.
        for (const sessionId of Object.keys(remoteSolvesBySession)) {
            if (!mergedSessions[sessionId] && !deletedSessionIds.has(sessionId)) {
                mergedSessions[sessionId] = {
                    id: sessionId,
                    name: sessionId === 'no-session' ? 'No Session' : 'Recovered Session',
                    discipline: '3x3',
                    solves: [],
                    subsessions: [],
                    isDefault: sessionId === 'no-session',
                    honestMode: null
                };
            }
        }

        // Solves that exist locally (or only in the legacy embedded field)
        // but never made it to the new subcollection. Only meaningful to
        // compute during a FULL sync -- remoteSolves only holds the whole
        // remote set in that case, so "not found in remoteSolves" actually
        // means "missing from Firestore". During a delta sync, remoteSolves
        // is deliberately just the recent changes, so the same check would
        // wrongly flag most of the untouched local history as missing and
        // re-push it. Anything that genuinely fails to push is instead
        // caught by PendingSync/flushPendingSync above.
        const localSolvesNotYetRemote = [];
        for (const sessionId of Object.keys(mergedSessions)) {
            if (deletedSessionIds.has(sessionId)) continue;
            const localSolves = timer.sessions[sessionId]?.solves || [];
            const remoteSolves = remoteSolvesBySession[sessionId] || [];

            let solvesWithLegacy = localSolves;
            if (isFullSync) {
                // Backward-compat: sessions created before the subcollection
                // rewrite may still have their solves sitting in the OLD
                // embedded field (remote.sessions[id].solves from the
                // metadata doc). Treat that as a third merge source instead
                // of silently discarding it.
                const legacySolves = (remoteMeta?.sessions?.[sessionId]?.solves) || [];
                solvesWithLegacy = SyncMerge.mergeSolves(localSolves, legacySolves, deletedSolveIds);
            }
            mergedSessions[sessionId].solves = SyncMerge.mergeSolves(solvesWithLegacy, remoteSolves, deletedSolveIds);
            mergedSessions[sessionId].id = sessionId;
            mergedSessions[sessionId].subsessions = Array.isArray(mergedSessions[sessionId].subsessions) ? mergedSessions[sessionId].subsessions : [];

            if (isFullSync) {
                const remoteIds = new Set(remoteSolves.map(s => s.id));
                for (const solve of mergedSessions[sessionId].solves) {
                    if (!remoteIds.has(solve.id) && !deletedSolveIds.has(solve.id)) {
                        localSolvesNotYetRemote.push({ sessionId, solve });
                    }
                }
            }
        }

        if (!Object.keys(mergedSessions).length) {
            mergedSessions['no-session'] = { id: 'no-session', name: 'No Session', solves: [], subsessions: [], isDefault: true, discipline: '3x3', honestMode: null };
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

        // Everything above succeeded -- safe to advance the delta baseline.
        const newestSolveCursor = Math.max(0, ...remoteHistory.solves.map(s => Number(s.cloudUpdatedAt) || 0));
        const newestDeleteCursor = Math.max(0, ...remoteHistory.tombstones.map(t => Number(t.cloudDeletedAt) || 0));
        AppStorage.setRaw('cloudSyncCursorV3', String(Math.max(cloudCursor, newestSolveCursor, newestDeleteCursor)));
        AppStorage.setRaw('cloudSyncInitializedV3', '1');
        AppStorage.setRaw('syncProtocolVersion', syncProtocolVersion);

        // Push metadata once if it changed, and (full sync only) backfill
        // any solves that were created locally but never reached Firestore
        // at all (e.g. made while offline before the very first sign-in on
        // this device). Each solve is still exactly one write either way.
        if (!(await AppSync.pushSessionsMetaNow())) throw Object.assign(new Error('Session metadata write failed'), { code: 'metadata-write-failed' });
        for (const { sessionId, solve } of localSolvesNotYetRemote) {
            if (!(await CloudSync.pushNewSolve(sessionId, solve))) throw Object.assign(new Error('Solve backfill failed'), { code: 'solve-write-failed' });
        }
        if (shouldPushCustomPhrases && !(await AppSync.pushCustomPhrasesNow())) throw Object.assign(new Error('Custom phrases write failed'), { code: 'phrases-write-failed' });
        window.progression?.ensureDaily?.();
        if (window.progression && !(await AppSync.pushProgressionNow())) throw Object.assign(new Error('Progression write failed'), { code: 'progression-write-failed' });
        AppSync.startCustomPhrasesLiveSync();
    },

    // ---- Point-write helpers, called directly from Timer on each action ----
    pushNewSolve(sessionId, solve) {
        CloudSync.pushNewSolve(sessionId, solve);
        window.dispatchEvent(new CustomEvent('timerdatachange', { detail: { type: 'solve', solveId: solve?.id } }));
    },
    pushSolveUpdate(solveId, patch) {
        CloudSync.pushSolveUpdate(solveId, patch);
        window.dispatchEvent(new CustomEvent('timerdatachange', { detail: { type: 'update', solveId } }));
    },
    pushSolveDelete(solveId) {
        CloudSync.pushSolveDelete(solveId);
        window.dispatchEvent(new CustomEvent('timerdatachange', { detail: { type: 'delete', solveId } }));
    },

    async pushCustomPhrasesNow() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return false;
        const customPhrases = AppStorage.getJSON('customPhrases', {});
        const customPhrasesUpdatedAt = Number(AppStorage.getRaw('customPhrasesUpdatedAt', '0')) || Date.now();
        return CloudSync.pushMeta({ customPhrases, customPhrasesUpdatedAt });
    },

    async pushProgressionNow() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser() || !window.progression) return false;
        return CloudSync.pushMeta({ progressionState: window.progression.exportState() });
    },

    async pushImportedSessions(sessionGroups) {
        const queueAll = () => (sessionGroups || []).forEach(group => (group.solves || []).forEach(solve => PendingSync.addPendingSolve(group.sessionId, solve.id)));
        if (!window.CubeAuth?.getCurrentUser?.()) {
            queueAll();
            return false;
        }
        if (!window.CubeSync?.saveSolvesBatch) {
            queueAll();
            window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'error', code: 'batch-api-unavailable' } }));
            return false;
        }
        window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'syncing' } }));
        try {
            for (const group of (sessionGroups || [])) {
                await window.CubeSync.saveSolvesBatch(group.sessionId, group.solves || []);
            }
            await this.pushSessionsMetaNow();
            AppStorage.setRaw('cloudSyncInitializedV3', '');
            await this.requestSync();
            return true;
        } catch (error) {
            console.error('Imported solve upload failed:', error);
            queueAll();
            window.dispatchEvent(new CustomEvent('sync-status', { detail: { state: 'error', code: error?.code || 'import-upload-failed' } }));
            return false;
        }
    },

    startCustomPhrasesLiveSync() {
        if (_customPhrasesUnsubscribe || !window.CubeAuth?.getCurrentUser?.() || !window.CubeSync?.subscribeUserData) return;
        try {
            _customPhrasesUnsubscribe = window.CubeSync.subscribeUserData((remote) => {
                if (remote?.progressionState) window.progression?.mergeCloudState?.(remote.progressionState);
                const remoteUpdatedAt = Number(remote?.customPhrasesUpdatedAt) || 0;
                const localUpdatedAt = Number(AppStorage.getRaw('customPhrasesUpdatedAt', '0')) || 0;
                if (!remote?.customPhrases || remoteUpdatedAt <= localUpdatedAt) return;
                if (window.commentary?.setCustomPhrases) {
                    window.commentary.setCustomPhrases(remote.customPhrases, remoteUpdatedAt);
                } else {
                    AppStorage.setJSON('customPhrases', remote.customPhrases);
                    AppStorage.setRaw('customPhrasesUpdatedAt', String(remoteUpdatedAt));
                    window.dispatchEvent(new CustomEvent('customphraseschange'));
                }
            });
        } catch (e) {
            console.error('Custom phrases live sync failed:', e);
        }
    },

    stopCustomPhrasesLiveSync() {
        if (_customPhrasesUnsubscribe) _customPhrasesUnsubscribe();
        _customPhrasesUnsubscribe = null;
    },

    // Metadata (session names/disciplines/current session) is small and
    // changes rarely, so it's fine to push it as a whole -- debounced the
    // same way the old blob push was, just without the solve history
    // riding along with it.
    pushSessionsMetaNow() {
        if (!window.CubeAuth || !window.CubeAuth.getCurrentUser()) return false;
        const timer = window.timer;
        if (!timer) return false;
        const sessionsMeta = {};
        for (const [id, session] of Object.entries(timer.sessions)) {
            const { solves, ...meta } = session; // eslint-disable-line no-unused-vars
            sessionsMeta[id] = meta;
        }
        return CloudSync.pushMeta({
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

// Firebase, AppSync and CubeTimer are loaded by separate scripts. Whichever
// becomes ready last triggers one deduplicated synchronization pass.
const requestSyncWhenReady = () => {
    if (!window.timer || !window.CubeAuth?.getCurrentUser?.()) return;
    AppSync.requestSync();
};
window.addEventListener('firebase-ready', requestSyncWhenReady);
window.addEventListener('firebase-auth-state', requestSyncWhenReady);
window.addEventListener('timer-ready', requestSyncWhenReady);
window.addEventListener('online', requestSyncWhenReady);
window.addEventListener('focus', requestSyncWhenReady);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestSyncWhenReady();
});
setInterval(requestSyncWhenReady, 15000);
if (document.readyState !== 'loading') queueMicrotask(requestSyncWhenReady);

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
