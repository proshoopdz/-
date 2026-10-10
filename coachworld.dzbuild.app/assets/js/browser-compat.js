/**
 * Browser Compatibility Utilities
 * Provides fallbacks for localStorage, fetch, and other modern APIs
 * Safe for all browsers including IE11 and private browsing mode
 */
(function(window) {
    'use strict';

    // ============================================
    // SAFE STORAGE WRAPPER (handles private mode)
    // ============================================
    var SafeStorage = {
        _memoryStorage: {},
        _isAvailable: null,

        // Check if localStorage is available
        isAvailable: function() {
            if (this._isAvailable !== null) return this._isAvailable;

            try {
                var testKey = '__storage_test__';
                window.localStorage.setItem(testKey, testKey);
                window.localStorage.removeItem(testKey);
                this._isAvailable = true;
            } catch (e) {
                this._isAvailable = false;
            }
            return this._isAvailable;
        },

        getItem: function(key) {
            if (this.isAvailable()) {
                try {
                    return window.localStorage.getItem(key);
                } catch (e) {
                    return this._memoryStorage[key] || null;
                }
            }
            return this._memoryStorage[key] || null;
        },

        setItem: function(key, value) {
            if (this.isAvailable()) {
                try {
                    window.localStorage.setItem(key, value);
                    return;
                } catch (e) {
                    // Quota exceeded or private mode
                }
            }
            this._memoryStorage[key] = String(value);
        },

        removeItem: function(key) {
            if (this.isAvailable()) {
                try {
                    window.localStorage.removeItem(key);
                } catch (e) {}
            }
            delete this._memoryStorage[key];
        }
    };

    // ============================================
    // FETCH POLYFILL CHECK
    // ============================================
    var safeFetch = window.fetch ? window.fetch.bind(window) : function(url, options) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            var method = (options && options.method) || 'GET';

            xhr.open(method, url, true);

            // Set headers
            if (options && options.headers) {
                Object.keys(options.headers).forEach(function(key) {
                    xhr.setRequestHeader(key, options.headers[key]);
                });
            }

            xhr.onload = function() {
                var response = {
                    ok: xhr.status >= 200 && xhr.status < 300,
                    status: xhr.status,
                    statusText: xhr.statusText,
                    json: function() {
                        return Promise.resolve(JSON.parse(xhr.responseText));
                    },
                    text: function() {
                        return Promise.resolve(xhr.responseText);
                    }
                };
                resolve(response);
            };

            xhr.onerror = function() {
                reject(new Error('Network request failed'));
            };

            xhr.send(options && options.body ? options.body : null);
        });
    };

    // ============================================
    // PROMISE POLYFILL CHECK (basic)
    // ============================================
    if (typeof Promise === 'undefined') {
        // Very basic Promise polyfill for IE11
        window.Promise = function(executor) {
            var self = this;
            self._state = 'pending';
            self._value = undefined;
            self._handlers = [];

            function resolve(value) {
                if (self._state !== 'pending') return;
                self._state = 'fulfilled';
                self._value = value;
                self._handlers.forEach(function(h) {
                    h.onFulfilled(value);
                });
            }

            function reject(reason) {
                if (self._state !== 'pending') return;
                self._state = 'rejected';
                self._value = reason;
                self._handlers.forEach(function(h) {
                    h.onRejected(reason);
                });
            }

            try {
                executor(resolve, reject);
            } catch (e) {
                reject(e);
            }
        };

        Promise.prototype.then = function(onFulfilled, onRejected) {
            var self = this;
            return new Promise(function(resolve, reject) {
                function handle(value) {
                    try {
                        var result = onFulfilled ? onFulfilled(value) : value;
                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                }

                function handleReject(reason) {
                    try {
                        if (onRejected) {
                            var result = onRejected(reason);
                            resolve(result);
                        } else {
                            reject(reason);
                        }
                    } catch (e) {
                        reject(e);
                    }
                }

                if (self._state === 'fulfilled') {
                    setTimeout(function() {
                        handle(self._value);
                    }, 0);
                } else if (self._state === 'rejected') {
                    setTimeout(function() {
                        handleReject(self._value);
                    }, 0);
                } else {
                    self._handlers.push({
                        onFulfilled: handle,
                        onRejected: handleReject
                    });
                }
            });
        };

        Promise.prototype.catch = function(onRejected) {
            return this.then(null, onRejected);
        };

        Promise.resolve = function(value) {
            return new Promise(function(resolve) {
                resolve(value);
            });
        };

        Promise.reject = function(reason) {
            return new Promise(function(_, reject) {
                reject(reason);
            });
        };
    }

    // ============================================
    // CSS VIEWPORT HEIGHT FIX
    // ============================================
    function setAppHeight() {
        var vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', vh + 'px');
        document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    }

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', function() {
        setTimeout(setAppHeight, 100);
    });

    // ============================================
    // SAFE CART UTILITIES
    // ============================================
    var CartUtils = {
        getCart: function(storeSlug) {
            try {
                var data = SafeStorage.getItem('cart_' + storeSlug);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                return [];
            }
        },

        saveCart: function(storeSlug, cart) {
            try {
                SafeStorage.setItem('cart_' + storeSlug, JSON.stringify(cart));
            } catch (e) {
                console.warn('Could not save cart:', e);
            }
        },

        clearCart: function(storeSlug) {
            SafeStorage.removeItem('cart_' + storeSlug);
        },

        getCount: function(storeSlug) {
            var cart = this.getCart(storeSlug);
            return cart.reduce(function(sum, item) {
                return sum + (item.quantity || 1);
            }, 0);
        }
    };

    // ============================================
    // ES2017 POLYFILLS
    // ============================================
    // Android System WebView < 57 (old Facebook in-app browsers) has no padStart; product-page.js calls it at top level.
    if (!String.prototype.padStart) {
        String.prototype.padStart = function(targetLength, padString) {
            var str = String(this);
            targetLength = targetLength >> 0;
            padString = padString === undefined ? ' ' : String(padString);
            if (str.length >= targetLength || padString === '') return str;
            var fill = '';
            while (fill.length < targetLength - str.length) fill += padString;
            return fill.slice(0, targetLength - str.length) + str;
        };
    }

    // ============================================
    // EXPORT UTILITIES
    // ============================================
    window.SafeStorage = SafeStorage;
    window.safeFetch = safeFetch;
    window.CartUtils = CartUtils;

    // Also provide backward compatibility
    // Reading window.localStorage throws when the browser denies storage for the document.
    try {
        if (!window.localStorage) {
            window.localStorage = {
                getItem: function(k) {
                    return SafeStorage.getItem(k);
                },
                setItem: function(k, v) {
                    SafeStorage.setItem(k, v);
                },
                removeItem: function(k) {
                    SafeStorage.removeItem(k);
                }
            };
        }
    } catch (e) {}

})(window);