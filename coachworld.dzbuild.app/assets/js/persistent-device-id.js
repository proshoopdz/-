/**
 * Persistent Device ID
 * 
 * Generates a unique device identifier and stores it redundantly across
 * localStorage, IndexedDB, and expects a server-side HTTP-only cookie.
 * If any source has the value, the others are restored automatically.
 * 
 * This makes the device ID survive:
 * - Browser restarts
 * - Clearing one storage mechanism
 * - Incognito mode (if cookie persists from prior session)
 * 
 * Exposed API:
 *   window.DZDevice.getDeviceId()  — returns string or null (sync)
 *   window.DZDevice.ready(cb)      — calls cb(deviceId) when ready
 */
(function() {
    'use strict';

    var LS_KEY = '_dz_did';
    var IDB_NAME = 'dz_device_store';
    var IDB_STORE = 'device';
    var IDB_KEY = 'device_id';

    var _deviceId = null;
    var _readyCallbacks = [];
    var _resolved = false;

    // ---- UUID v4 generator (crypto-safe) ----
    function generateUUID() {
        if (window.crypto && crypto.getRandomValues) {
            var buf = new Uint8Array(16);
            crypto.getRandomValues(buf);
            buf[6] = (buf[6] & 0x0f) | 0x40;
            buf[8] = (buf[8] & 0x3f) | 0x80;
            var hex = '';
            for (var i = 0; i < 16; i++) {
                var h = buf[i].toString(16);
                hex += (h.length === 1 ? '0' : '') + h;
            }
            return hex.substr(0, 8) + '-' + hex.substr(8, 4) + '-' + hex.substr(12, 4) + '-' + hex.substr(16, 4) + '-' + hex.substr(20, 12);
        }
        // Fallback (weak but functional)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ---- localStorage helpers ----
    function lsGet() {
        try {
            return localStorage.getItem(LS_KEY) || null;
        } catch (e) {
            return null;
        }
    }

    function lsSet(val) {
        try {
            localStorage.setItem(LS_KEY, val);
        } catch (e) {}
    }

    // ---- IndexedDB helpers ----
    function idbGet(callback) {
        try {
            var req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = function(e) {
                try {
                    var idb = e.target.result;
                    if (idb && !idb.objectStoreNames.contains(IDB_STORE)) {
                        idb.createObjectStore(IDB_STORE);
                    }
                } catch (ex) {}
            };
            req.onsuccess = function(e) {
                try {
                    var idb = e.target.result;
                    var tx = idb.transaction(IDB_STORE, 'readonly');
                    var store = tx.objectStore(IDB_STORE);
                    var getReq = store.get(IDB_KEY);
                    getReq.onsuccess = function() {
                        callback(getReq.result || null);
                    };
                    getReq.onerror = function() {
                        callback(null);
                    };
                } catch (ex) {
                    callback(null);
                }
            };
            req.onerror = function() {
                callback(null);
            };
        } catch (e) {
            callback(null);
        }
    }

    function idbSet(val) {
        try {
            var req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = function(e) {
                try {
                    var idb = e.target.result;
                    if (idb && !idb.objectStoreNames.contains(IDB_STORE)) {
                        idb.createObjectStore(IDB_STORE);
                    }
                } catch (ex) {}
            };
            req.onsuccess = function(e) {
                try {
                    var idb = e.target.result;
                    var tx = idb.transaction(IDB_STORE, 'readwrite');
                    tx.objectStore(IDB_STORE).put(val, IDB_KEY);
                } catch (ex) {}
            };
        } catch (e) {}
    }

    // ---- Cookie helpers (non-HttpOnly so server reads it on JSON requests too) ----
    function cookieSet(val) {
        try {
            var secure = (location.protocol === 'https:') ? '; Secure' : '';
            // 10-year expiry, root path, Lax for cross-page navigation, scoped to current host.
            var maxAge = 10 * 365 * 24 * 3600;
            document.cookie = LS_KEY + '=' + encodeURIComponent(val) +
                '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' + secure;
        } catch (e) {}
    }

    // ---- Resolve and persist across all stores ----
    function persist(id) {
        _deviceId = id;
        lsSet(id);
        idbSet(id);
        cookieSet(id);
    }

    function resolve(id) {
        if (_resolved) return;
        _resolved = true;
        _deviceId = id;
        // Inject into any forms that exist now
        injectIntoForms();
        // Notify callbacks
        for (var i = 0; i < _readyCallbacks.length; i++) {
            try {
                _readyCallbacks[i](id);
            } catch (e) {}
        }
        _readyCallbacks = [];
    }

    function injectIntoForms() {
        if (!_deviceId) return;
        var forms = document.querySelectorAll('form');
        for (var i = 0; i < forms.length; i++) {
            var form = forms[i];
            if (!form.querySelector('input[name="_did"]')) {
                var input = document.createElement('input');
                input.type = 'hidden';
                input.name = '_did';
                input.value = _deviceId;
                form.appendChild(input);
            } else {
                form.querySelector('input[name="_did"]').value = _deviceId;
            }
        }
    }

    // ---- Init: read from all sources, reconcile ----
    function init() {
        var fromLS = lsGet();

        idbGet(function(fromIDB) {
            // Pick whichever source has a value (prefer localStorage, then IDB)
            var id = fromLS || fromIDB || null;

            if (id) {
                persist(id);
                resolve(id);
            } else {
                // No existing ID anywhere — generate new one
                id = generateUUID();
                persist(id);
                resolve(id);
            }
        });

        // If IndexedDB is slow/blocked, resolve from localStorage after a short wait
        setTimeout(function() {
            if (!_resolved) {
                var id = fromLS || generateUUID();
                persist(id);
                resolve(id);
            }
        }, 200);
    }

    // ---- Re-inject on DOM changes (for dynamically added forms) ----
    function observeForms() {
        if (typeof MutationObserver === 'undefined') return;
        var observer = new MutationObserver(function() {
            if (_deviceId) injectIntoForms();
        });
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // ---- Public API ----
    window.DZDevice = {
        getDeviceId: function() {
            return _deviceId;
        },
        ready: function(cb) {
            if (_resolved) {
                try {
                    cb(_deviceId);
                } catch (e) {}
            } else {
                _readyCallbacks.push(cb);
            }
        }
    };

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            init();
            observeForms();
        });
    } else {
        init();
        observeForms();
    }
})();