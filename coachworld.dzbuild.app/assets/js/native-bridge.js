/**
 * DZ Build Native Bridge
 * Runs inside the Capacitor WebView to provide native functionality.
 * Uses the global Capacitor.Plugins API (auto-injected by Capacitor runtime).
 * Only activates when running inside the native app.
 */
(function() {
    'use strict';

    // Only run inside Capacitor native app
    if (typeof Capacitor === 'undefined' || !Capacitor.isNativePlatform()) return;

    var Plugins = Capacitor.Plugins;

    // ── Status Bar ──────────────────────────────
    function setupStatusBar() {
        var StatusBar = Plugins.StatusBar;
        if (!StatusBar) return;
        try {
            StatusBar.setBackgroundColor({
                color: '#0f0f23'
            });
            StatusBar.setStyle({
                style: 'DARK'
            });
        } catch (e) { /* silent */ }
    }

    // ── Status bar inset ────────────────────────
    // Edge-to-edge WebViews (Android 15+) draw under the status bar while older
    // WebViews report env(safe-area-inset-top) as 0; publish the measured height
    // so the shell CSS (--dz-safe-top) can clear the bar.
    function setupSafeArea() {
        var StatusBar = Plugins.StatusBar;
        if (!StatusBar || typeof StatusBar.getInfo !== 'function') return;
        StatusBar.getInfo().then(function(info) {
            if (!info || info.visible === false || !(info.height > 0)) return;
            var probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden';
            document.body.appendChild(probe);
            var reported = parseFloat(getComputedStyle(probe).paddingTop) || 0;
            probe.remove();
            var android = /Android (\d+)/.exec(navigator.userAgent);
            var overlays = info.overlays === true || (android && parseInt(android[1], 10) >= 15);
            if (overlays && reported < 1) {
                document.documentElement.style.setProperty('--dz-native-status-bar', Math.round(info.height) + 'px');
            }
        }).catch(function() { /* plugin too old for getInfo */ });
    }

    // ── Push Notifications (FCM) ────────────────
    var pendingFcmToken = null;

    function setupPushNotifications() {
        var Push = Plugins.PushNotifications;
        if (!Push) return;

        Push.requestPermissions().then(function(perm) {
            if (perm.receive !== 'granted') return;
            Push.register();
        }).catch(function() { /* permission denied */ });

        Push.addListener('registration', function(token) {
            pendingFcmToken = token.value;
            sendTokenToServer(token.value);
        });

        Push.addListener('registrationError', function() { /* silent */ });

        Push.addListener('pushNotificationReceived', function(n) {
            showInAppBanner(n.title, n.body, n.data);
        });

        Push.addListener('pushNotificationActionPerformed', function(action) {
            var data = action.notification.data;
            if (data && data.url && isSafeUrl(data.url)) window.location.href = data.url;
        });
    }

    function sendTokenToServer(token) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/push/register-device', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'DZBuild-App');
        xhr.withCredentials = true;
        xhr.onload = function() {
            if (xhr.status === 200) {
                pendingFcmToken = null; // registered successfully
            }
            // If 401 (not logged in), keep pendingFcmToken for retry on navigation
        };
        xhr.send(JSON.stringify({
            token: token,
            platform: 'android',
            type: 'fcm'
        }));
    }

    // Retry pending token registration on page navigations (user may have logged in)
    function retryPendingToken() {
        if (pendingFcmToken) {
            sendTokenToServer(pendingFcmToken);
        }
    }

    // ── In-App Notification Banner ──────────────
    function showInAppBanner(title, body, data) {
        var el = document.createElement('div');
        el.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99999;' +
            'background:linear-gradient(135deg,#1a1a2e,#16213e);' +
            'border-bottom:2px solid rgba(245,158,11,.4);' +
            'padding:16px 20px;padding-top:calc(16px + var(--dz-safe-top, env(safe-area-inset-top, 0px)));' +
            'color:#fff;font-family:-apple-system,sans-serif;' +
            'transform:translateY(-100%);transition:transform .3s ease;cursor:pointer';

        var safeTitle = escapeText(title || 'DZ Build');
        var safeBody = escapeText(body || '');
        el.innerHTML =
            '<div style="font-weight:700;font-size:14px;margin-bottom:4px">' + safeTitle + '</div>' +
            '<div style="font-size:13px;color:rgba(255,255,255,.7)">' + safeBody + '</div>';

        el.onclick = function() {
            dismiss(el);
            if (data && data.url && isSafeUrl(data.url)) window.location.href = data.url;
        };

        document.body.appendChild(el);
        requestAnimationFrame(function() {
            el.style.transform = 'translateY(0)';
        });
        setTimeout(function() {
            dismiss(el);
        }, 5000);
    }

    function dismiss(el) {
        el.style.transform = 'translateY(-100%)';
        setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }

    function escapeText(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function isSafeUrl(url) {
        try {
            var u = new URL(url, window.location.origin);
            if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
            return u.hostname === 'dzbuild.com' || u.hostname.endsWith('.dzbuild.com') ||
                u.hostname.endsWith('.dzbuild.me');
        } catch (e) {
            return false;
        }
    }

    // ── App Lifecycle ───────────────────────────
    function setupAppLifecycle() {
        var AppPlugin = Plugins.App;
        if (!AppPlugin) return;

        AppPlugin.addListener('backButton', function(ev) {
            if (ev.canGoBack) {
                window.history.back();
            } else {
                AppPlugin.minimizeApp();
            }
        });

        AppPlugin.addListener('appUrlOpen', function(event) {
            try {
                var url = new URL(event.url);
                if (url.hostname === 'dzbuild.com' || url.hostname.endsWith('.dzbuild.com')) {
                    window.location.href = event.url;
                }
            } catch (e) { /* invalid URL */ }
        });
    }

    // ── Network Monitor ─────────────────────────
    function setupNetworkMonitor() {
        var Net = Plugins.Network;
        if (!Net) return;

        var banner = null;

        Net.addListener('networkStatusChange', function(status) {
            if (!status.connected) {
                if (banner) return;
                banner = document.createElement('div');
                banner.style.cssText =
                    'position:fixed;bottom:0;left:0;right:0;z-index:99999;' +
                    'background:#ef4444;color:#fff;text-align:center;' +
                    'padding:10px;font-size:13px;font-weight:600';
                banner.textContent = (window.T && T.offline_message) || 'لا يوجد اتصال بالإنترنت';
                document.body.appendChild(banner);
            } else if (banner) {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
                banner = null;
            }
        });
    }

    // ── External Links → System Browser ─────────
    function setupExternalLinks() {
        var Browser = Plugins.Browser;
        if (!Browser) return;

        document.addEventListener('click', function(e) {
            var a = e.target.closest ? e.target.closest('a') : null;
            if (!a || !a.href) return;
            try {
                var url = new URL(a.href, window.location.origin);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
                if (url.hostname === 'dzbuild.com' || url.hostname.endsWith('.dzbuild.com') ||
                    url.hostname.endsWith('.dzbuild.me')) return;
                // External link → open in system browser
                e.preventDefault();
                Browser.open({
                    url: a.href
                });
            } catch (ex) { /* invalid URL, let default handling */ }
        }, true);
    }

    // ── Native Share ────────────────────────────
    window.nativeShare = function(opts) {
        var SharePlugin = Plugins.Share;
        if (SharePlugin) {
            return SharePlugin.share({
                title: opts.title || 'DZ Build',
                text: opts.text || '',
                url: opts.url || window.location.href,
                dialogTitle: opts.title || (window.T && T.share_title) || 'مشاركة',
            });
        }
        // Fallback to Web Share API
        if (navigator.share) return navigator.share(opts);
        return Promise.reject(new Error('Share not available'));
    };

    // ── Initialize ──────────────────────────────
    function init() {
        setupStatusBar();
        setupSafeArea();
        setupPushNotifications();
        setupAppLifecycle();
        setupNetworkMonitor();
        setupExternalLinks();
        // Retry pending FCM token on each page load (handles post-login)
        retryPendingToken();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();