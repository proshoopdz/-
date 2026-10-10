/**
 * DZBuild Visitor Tracking - Fingerprint & Analytics
 * Privacy-friendly browser fingerprinting for store analytics
 * 
 * Features:
 * - Canvas fingerprint
 * - WebGL fingerprint
 * - Audio fingerprint
 * - Screen/device info
 * - No cookies needed
 * - GDPR-friendly (anonymous hash)
 */
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        endpoint: '/api/track-visit',
        sessionKey: 'dz_session_id',
        debounceMs: 1000,
        maxRetries: 2
    };

    // Generate unique session ID (persists for browser session)
    let memorySessionId = '';

    function getSessionId() {
        try {
            let sessionId = sessionStorage.getItem(CONFIG.sessionKey);
            if (!sessionId) {
                sessionId = generateRandomId();
                sessionStorage.setItem(CONFIG.sessionKey, sessionId);
            }
            return sessionId;
        } catch (e) {
            // Storage denied for this document: keep one id for the page view.
            return memorySessionId || (memorySessionId = generateRandomId());
        }
    }

    // Generate random ID
    function generateRandomId() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => ('0' + b.toString(16)).slice(-2)).join('');
    }

    // Detect device type
    function getDeviceType() {
        const ua = navigator.userAgent.toLowerCase();
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return 'tablet';
        }
        if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
            return 'mobile';
        }
        return 'desktop';
    }

    // Get canvas fingerprint
    function getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 50;

            // Draw text with various styles
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('DZBuild <canvas> 1.0', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('DZBuild <canvas> 1.0', 4, 17);

            // Draw shapes
            ctx.beginPath();
            ctx.arc(50, 25, 20, 0, Math.PI * 2);
            ctx.stroke();

            return canvas.toDataURL();
        } catch (e) {
            return '';
        }
    }

    // Get WebGL fingerprint
    function getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return '';

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                return vendor + '~' + renderer;
            }
            return gl.getParameter(gl.VENDOR) + '~' + gl.getParameter(gl.RENDERER);
        } catch (e) {
            return '';
        }
    }

    // Get audio fingerprint
    function getAudioFingerprint() {
        return new Promise((resolve) => {
            try {
                const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                if (!AudioContext) {
                    resolve('');
                    return;
                }

                const context = new AudioContext(1, 44100, 44100);
                const oscillator = context.createOscillator();
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(10000, context.currentTime);

                const compressor = context.createDynamicsCompressor();
                compressor.threshold.setValueAtTime(-50, context.currentTime);
                compressor.knee.setValueAtTime(40, context.currentTime);
                compressor.ratio.setValueAtTime(12, context.currentTime);
                compressor.attack.setValueAtTime(0, context.currentTime);
                compressor.release.setValueAtTime(0.25, context.currentTime);

                oscillator.connect(compressor);
                compressor.connect(context.destination);
                oscillator.start(0);

                context.startRendering().then((buffer) => {
                    const data = buffer.getChannelData(0);
                    let sum = 0;
                    for (let i = 4500; i < 5000; i++) {
                        sum += Math.abs(data[i]);
                    }
                    resolve(sum.toString());
                }).catch(() => resolve(''));

                setTimeout(() => resolve(''), 500);
            } catch (e) {
                resolve('');
            }
        });
    }

    // Get screen info
    function getScreenInfo() {
        return {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio || 1
        };
    }

    // Get timezone
    function getTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            return new Date().getTimezoneOffset().toString();
        }
    }

    // Get language
    function getLanguage() {
        return navigator.language || navigator.userLanguage || 'unknown';
    }

    // Get plugins info
    function getPluginsInfo() {
        const plugins = [];
        if (navigator.plugins) {
            for (let i = 0; i < Math.min(navigator.plugins.length, 10); i++) {
                plugins.push(navigator.plugins[i].name);
            }
        }
        return plugins.join(',');
    }

    // SHA256 hash function
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => ('0' + b.toString(16)).slice(-2)).join('');
    }

    // Generate browser fingerprint
    async function generateFingerprint() {
        const components = [];

        // Basic info
        components.push(navigator.userAgent);
        components.push(getLanguage());
        components.push(getTimezone());
        components.push(getPluginsInfo());

        // Screen info
        const screenInfo = getScreenInfo();
        components.push(JSON.stringify(screenInfo));

        // Canvas fingerprint
        components.push(getCanvasFingerprint());

        // WebGL fingerprint
        components.push(getWebGLFingerprint());

        // Audio fingerprint
        const audioFp = await getAudioFingerprint();
        components.push(audioFp);

        // Platform info
        components.push(navigator.platform || '');
        components.push(navigator.hardwareConcurrency || '');
        components.push(navigator.maxTouchPoints || 0);

        // Generate hash
        const fingerprintString = components.join('|||');
        return await sha256(fingerprintString);
    }

    // Get UTM parameters
    function getUTMParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || ''
        };
    }

    // Detect page type
    function getPageType() {
        const path = window.location.pathname.toLowerCase();

        if (path === '/' || path === '' || path.includes('/home')) {
            return 'home';
        }
        if (path.includes('/product/') || path.includes('/p/')) {
            return 'product';
        }
        if (path.includes('/category/') || path.includes('/c/')) {
            return 'category';
        }
        if (path.includes('/cart')) {
            return 'cart';
        }
        if (path.includes('/checkout')) {
            return 'checkout';
        }
        if (path.includes('/search')) {
            return 'search';
        }
        if (path.includes('/lp/') || path.includes('/landing')) {
            return 'landing';
        }
        return 'other';
    }

    // Get product ID from page
    function getProductId() {
        // Check data attribute first
        const productEl = document.querySelector('[data-product-id]');
        if (productEl) {
            return productEl.dataset.productId;
        }

        // Check meta tag
        const metaEl = document.querySelector('meta[name="product-id"]');
        if (metaEl) {
            return metaEl.content;
        }

        // Try to extract from URL
        const match = window.location.pathname.match(/\/product\/(\d+)/);
        if (match) {
            return match[1];
        }

        return null;
    }

    // Send tracking data
    async function sendTrackingData(fingerprint) {
        const utm = getUTMParams();
        const data = {
            fingerprint: fingerprint,
            page: getPageType(),
            product_id: getProductId(),
            referrer: document.referrer,
            utm_source: utm.utm_source,
            device_type: getDeviceType(),
            session_id: getSessionId()
        };

        try {
            // Use sendBeacon for reliability
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(data)], {
                    type: 'application/json'
                });
                navigator.sendBeacon(CONFIG.endpoint, blob);
            } else {
                // Fallback to fetch
                fetch(CONFIG.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data),
                    keepalive: true
                });
            }
        } catch (e) {
            console.debug('Tracking failed:', e);
        }
    }

    // Debounce function
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // The initial page-view must be counted exactly ONCE, but reliably — including for
    // fast ad-click bounces and slow in-app webviews (FB/IG/TikTok) that leave before the
    // async fingerprint finishes. So we send it promptly once the fingerprint is ready AND
    // arm a bounce safety-net (pagehide / tab-hidden, below) that fires it via sendBeacon on
    // the way out if it hasn't gone yet. The once-guard prevents any double count.
    let initialVisitSent = false;

    function sendInitialVisit(fingerprint) {
        if (initialVisitSent) return;
        // Respect the same bot + Do-Not-Track guards as the main path.
        if (/bot|crawler|spider|crawling/i.test(navigator.userAgent)) return;
        if (navigator.doNotTrack === '1') return;
        initialVisitSent = true;
        sendTrackingData(fingerprint || '');
        try {
            sessionStorage.setItem('dz_last_track', Date.now().toString());
        } catch (e) {}
    }

    // Initialize tracking
    async function initTracking() {
        // Don't track bots
        if (/bot|crawler|spider|crawling/i.test(navigator.userAgent)) {
            return;
        }

        // Don't track if DNT is enabled (respect user privacy)
        if (navigator.doNotTrack === '1') {
            return;
        }

        try {
            const fingerprint = await generateFingerprint();

            // Initial page-view — send promptly + once (the bounce net may have sent it already).
            sendInitialVisit(fingerprint);

            // Re-engagement: re-track when the tab becomes VISIBLE again after 30s+.
            // This is a distinct event from the initial view, so it is NOT once-guarded.
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    let lastTrack = 0;
                    try {
                        lastTrack = parseInt(sessionStorage.getItem('dz_last_track') || '0');
                    } catch (e) {}
                    if (Date.now() - lastTrack > 30000) {
                        sendTrackingData(fingerprint);
                        try {
                            sessionStorage.setItem('dz_last_track', Date.now().toString());
                        } catch (e) {}
                    }
                }
            });

        } catch (e) {
            console.debug('Fingerprint generation failed:', e);
            // Still count the view even if the fingerprint computation failed.
            sendInitialVisit('');
        }
    }

    // Cache for fingerprint (generated once, reused)
    let cachedFingerprint = null;
    let fingerprintPromise = null;

    // Get fingerprint with caching (async)
    async function getCachedFingerprint() {
        if (cachedFingerprint) {
            return cachedFingerprint;
        }
        if (fingerprintPromise) {
            return fingerprintPromise;
        }
        fingerprintPromise = generateFingerprint().then(fp => {
            cachedFingerprint = fp;
            // Store in sessionStorage for immediate access on page load
            try {
                sessionStorage.setItem('dz_fingerprint', fp);
            } catch (e) {}
            return fp;
        });
        return fingerprintPromise;
    }

    // Get fingerprint synchronously (from cache or storage)
    function getFingerprintSync() {
        if (cachedFingerprint) {
            return cachedFingerprint;
        }
        // Try sessionStorage
        try {
            const stored = sessionStorage.getItem('dz_fingerprint');
            if (stored) {
                cachedFingerprint = stored;
                return stored;
            }
        } catch (e) {}
        return null;
    }

    // Bounce safety-net — armed IMMEDIATELY (before initTracking's fingerprint finishes).
    // If the visitor leaves first (fast ad-click bounce, slow in-app webview), the page-view
    // is still sent on the way out via sendBeacon, using whatever fingerprint is cached (or
    // '' — COUNT(*) page-views are captured either way). visibilitychange→hidden + pagehide
    // are the most reliable "the user actually saw this page" unload signals on mobile.
    function __dzFlushVisit() {
        sendInitialVisit(getFingerprintSync() || '');
    }
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') __dzFlushVisit();
    });
    window.addEventListener('pagehide', __dzFlushVisit);

    // Start tracking promptly. The page-view must be counted reliably for ad traffic, and
    // the order-path getFingerprintSync() also relies on the warm fingerprint cache, so we
    // do NOT defer this to idle (a prior idle-defer experiment was reverted — it delayed the
    // view past fast bounces). sendTrackingData uses sendBeacon, so it never blocks the page.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initTracking();
            getCachedFingerprint();
        });
    } else {
        initTracking();
        getCachedFingerprint();
    }

    // Expose for manual tracking and fingerprint access
    window.DZTrack = {
        track: async function(pageType, productId) {
            const fingerprint = await getCachedFingerprint();
            sendTrackingData(fingerprint);
        },
        // Async method - returns promise
        getFingerprint: async function() {
            return await getCachedFingerprint();
        },
        // Sync method - returns cached value or null
        getFingerprintSync: function() {
            return getFingerprintSync();
        }
    };

    // Alias for backward compatibility (MinacefTracker)
    window.MinacefTracker = window.DZTrack;

})();