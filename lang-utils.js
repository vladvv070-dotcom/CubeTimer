/* ============================================================
   Next Cube Pro -- language helpers
   Central place to read the current UI language. Settings live on
   window.settingsManager.settings (NOT on any class instance) --
   this file exists so that fact only has to be known in one place.
   Load this before any file/class that needs getLang()/isRu().
   ============================================================ */

function getLang() {
    return window.settingsManager?.settings?.language || 'en';
}

function isRu() {
    return getLang() === 'ru';
}

window.getLang = getLang;
window.isRu = isRu;
