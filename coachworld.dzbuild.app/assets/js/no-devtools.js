/**
 * DevTools & Inspection Blocker
 * Prevents F12, right-click, and common DevTools shortcuts
 */
(function() {
    'use strict';

    var isDashboard = window.location.pathname.indexOf('/dashboard') !== -1;
    var isBlog = window.location.pathname.indexOf('/blog') !== -1;

    // Block keyboard shortcuts (skip on dashboard and blog)
    document.addEventListener('keydown', function(e) {
        if (isDashboard || isBlog) return;
        // F12
        if (e.keyCode === 123) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Ctrl+Shift+I (Inspector)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Ctrl+Shift+J (Console)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Ctrl+Shift+C (Element picker)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Ctrl+U (View source)
        if (e.ctrlKey && e.keyCode === 85) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        // Ctrl+S (Save page)
        if (e.ctrlKey && e.keyCode === 83) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // Block right-click context menu (skip on dashboard and blog)
    if (!isDashboard && !isBlog) {
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        }, true);
    }

    // DevTools size-based detection removed — it falsely triggered on mobile
    // browsers where browser chrome (address bar, nav bar, notch) causes
    // outerHeight - innerHeight > 160px, wiping the entire page content.

    // Prevent drag (image/text dragging for inspection, skip on dashboard and blog)
    if (!isDashboard && !isBlog) {
        document.addEventListener('dragstart', function(e) {
            e.preventDefault();
            return false;
        }, true);
    }
    if (!isDashboard && !isBlog) {
        var style = document.createElement('style');
        style.textContent = '* { -webkit-user-select: none !important; -moz-user-select: none !important; -ms-user-select: none !important; user-select: none !important; } input, textarea, [contenteditable="true"] { -webkit-user-select: text !important; -moz-user-select: text !important; -ms-user-select: text !important; user-select: text !important; }';
        document.head.appendChild(style);
    }
})();