/* ============================================================
   Next Cube Pro -- localStorage access layer
   All persisted keys go through here instead of scattered raw
   localStorage.getItem/setItem calls. Preserves the exact on-disk
   format each key already used (raw string vs JSON) so existing
   users' saved data keeps working. Adds try/catch where callers
   previously had none, so corrupted/blocked storage degrades
   gracefully instead of throwing during init.
   ============================================================ */

const AppStorage = {
    getJSON(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    },
    setJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    },
    getRaw(key, fallback = null) {
        try {
            const val = localStorage.getItem(key);
            return val === null ? fallback : val;
        } catch (e) {
            return fallback;
        }
    },
    setRaw(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }
};

window.AppStorage = AppStorage;
