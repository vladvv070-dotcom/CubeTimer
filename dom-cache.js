/* ============================================================
   Next Cube Pro -- DOM lookup cache
   Only used for elements looked up by id in more than one place
   in script.js (~40 ids, ~120 call sites out of 296 total). The
   many one-off getElementById calls are left as-is -- caching
   those would add indirection with zero benefit.

   Safety: if a cached node is ever removed from the document
   (isConnected === false), the next call transparently re-queries
   instead of returning a stale reference.
   ============================================================ */

const DOM = (() => {
    const cache = new Map();
    return function dom(id) {
        let el = cache.get(id);
        // el === undefined -> never looked up yet, need a fresh query.
        // el === null -> looked up before and genuinely doesn't exist in the
        // DOM; that's a valid cached result, not a reason to re-query (and
        // el.isConnected would throw on null if we tried).
        if (el === undefined || (el !== null && !el.isConnected)) {
            el = document.getElementById(id);
            cache.set(id, el);
        }
        return el;
    };
})();

window.DOM = DOM;