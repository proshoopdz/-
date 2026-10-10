// Compatibility helpers for older browsers (Telegram/Instagram WebView)
function _val(el) {
    return el ? el.value : '';
}

function _valTrim(el) {
    return el && el.value ? el.value.trim() : '';
}

// Browsers that block site data throw on window.localStorage itself; at top level that killed the whole order script.
var _memStore = {};

function _store(kind) {
    try {
        var s = window[kind];
        s.getItem('__dz');
        return s;
    } catch (e) {}
    return {
        getItem: function(k) {
            return Object.prototype.hasOwnProperty.call(_memStore, kind + k) ? _memStore[kind + k] : null;
        },
        setItem: function(k, v) {
            _memStore[kind + k] = String(v);
        },
        removeItem: function(k) {
            delete _memStore[kind + k];
        }
    };
}

// ALTCHA Sentinel helpers — read current verified payload + reset for next attempt.
// Both no-op when the captcha-protection addon is not active (no widget on page).
function _captcha_value() {
    try {
        var w = document.querySelector('altcha-widget');
        if (!w) return '';
        var i = w.querySelector('input[name="altcha-response"]');
        return (i && i.value) ? i.value : '';
    } catch (e) {
        return '';
    }
}

function _captcha_refresh() {
    try {
        var w = document.querySelector('altcha-widget');
        if (!w) return;
        if (w.reset) {
            try {
                w.reset();
            } catch (e) {}
        }
        if (w.verify) {
            try {
                w.verify();
            } catch (e) {}
        }
    } catch (e) {}
}
// Waits (8 s cap) for the proof-of-work still running when the buyer taps submit; '' afterwards keeps today's server gate.
function _captcha_ready() {
    return new Promise(function(resolve) {
        var done = false;

        function finish() {
            if (!done) {
                done = true;
                resolve();
            }
        }
        try {
            var w = document.querySelector('altcha-widget');
            if (!w || typeof w.verify !== 'function' || typeof w.getState !== 'function') return finish();
            if (_captcha_value() || w.getState() === 'verified') return finish();
            setTimeout(function() {
                try {
                    if (!done && window.dzErr) window.dzErr('captcha_stuck', {
                        r: w.getState()
                    });
                } catch (e) {}
                finish();
            }, 8000);
            w.addEventListener('statechange', function(ev) {
                var st = ev.detail && ev.detail.state;
                if (st === 'verified' || st === 'error') finish();
            });
            if (w.getState() !== 'verifying') {
                var p = w.verify();
                if (p && typeof p.then === 'function') p.then(finish, finish);
            }
        } catch (e) {
            finish();
        }
    });
}

// NOTE: Same-origin proxy fallback intentionally REMOVED (2026-04-26).
// The widget MUST hit Sentinel directly so Sentinel sees the real customer
// IP for Threat Intel + per-IP rate limiting. The proxy path was a
// bot-bypass vector (spoofable X-Forwarded-For — bots could submit any IP
// they wanted and Sentinel would score the fake one). Customers with strict
// adblockers must whitelist captcha.dzbuild.me. Trade-off accepted: a few
// adblocker users see verification fail vs. unlimited bot bypass.

// Initialize Swipers
let thumbSwiper = null;
let mainSwiper = null;
let fullscreenSwiper = null;

document.addEventListener('DOMContentLoaded', function() {
    // Auto-size product title for long names
    var titleEl = document.querySelector('.product-title');
    if (titleEl) {
        // Hide stock badge if title is long to give it full width
        var len = titleEl.textContent.trim().length;
        if (len > 25) {
            var badge = document.querySelector('.stock-badge');
            if (badge) badge.style.display = 'none';
        }
        // Auto-detect text direction per title content
        var hasArabic = /[\u0600-\u06FF]/.test(titleEl.textContent);
        if (hasArabic) {
            titleEl.style.direction = 'rtl';
            titleEl.style.textAlign = 'right';
        } else {
            titleEl.style.direction = 'ltr';
            titleEl.style.textAlign = 'left';
        }
    }

    // Gallery init wrapped in try/catch: if swiper-bundle.min.js failed to
    // load (flaky in-app browser networks), `new Swiper` throws and would
    // kill the REST of this handler — including the ViewContent pixel
    // fires below, silently losing paid-ads attribution. A broken gallery
    // must never take the pixels down with it.
    try {
        // Thumbnail Swiper (if exists)
        if (!PD.stackedLayout) {
            if (PD.multiImage) {
                thumbSwiper = new Swiper('.thumb-swiper', {
                    spaceBetween: 10,
                    slidesPerView: 'auto',
                    freeMode: true,
                    watchSlidesProgress: true,
                });
            }

            // Main Swiper
            var _mainSwiperCfg = {
                spaceBetween: 0,
                loop: PD.multiImage,
                navigation: {
                    nextEl: '.main-swiper .swiper-button-next',
                    prevEl: '.main-swiper .swiper-button-prev',
                },
                pagination: {
                    el: '.main-swiper .swiper-pagination',
                    clickable: true,
                },
                on: {
                    slideChange: function() {
                        var counter = document.getElementById('currentSlide');
                        if (counter) counter.textContent = this.realIndex + 1;
                    }
                }
            };
            if (PD.multiImage) {
                _mainSwiperCfg.thumbs = {
                    swiper: thumbSwiper
                };
            }
            mainSwiper = new Swiper('.main-swiper', _mainSwiperCfg);
        }

        // Fullscreen Swiper
        fullscreenSwiper = new Swiper('.fullscreen-swiper', {
            spaceBetween: 0,
            zoom: true,
            loop: PD.multiImage,
            navigation: {
                nextEl: '.fullscreen-swiper .swiper-button-next',
                prevEl: '.fullscreen-swiper .swiper-button-prev',
            },
            pagination: {
                el: '.fullscreen-swiper .swiper-pagination',
                clickable: true,
            },
        });
    } catch (e) {
        console.warn('Swiper init failed (gallery degraded, pixels unaffected):', e);
    }

    // Track ViewContent event on all pixels when product page loads
    const productData = {
        content_name: PD.productName,
        content_ids: [PD.productId],
        content_id: PD.productId,
        content_type: 'product',
        contents: [{
            id: PD.productId,
            quantity: 1,
            item_price: PD.price
        }],
        value: PD.price,
        currency: 'DZD'
    };

    // Shared event_id so a server-side ViewContent (CAPI), if any, can dedup against this browser event
    var vcEventId = (typeof window.generateEventId === 'function') ? window.generateEventId('ViewContent') : ('ViewContent_' + Date.now());

    if (typeof window.trackPixelEvent === 'function') {
        // Canonical helper (layouts/store.php): fires every network with its
        // dedup id (Snap client_dedup_id, Pinterest event_id, GA value) AND
        // relays a server-side CAPI ViewContent — the browser-only path below
        // is lost whenever fbevents.js is blocked (ad-blockers, in-app browsers).
        window.trackPixelEvent('ViewContent', {
            content_name: PD.productName,
            content_ids: [PD.productId],
            content_id: PD.productId,
            content_type: 'product',
            contents: [{
                id: PD.productId,
                quantity: 1,
                item_price: PD.price
            }],
            value: PD.price,
            currency: 'DZD'
        }, vcEventId);
    } else {
        // Fallback: direct per-network calls (helper unavailable)
        // Facebook Pixel
        if (typeof fbq !== 'undefined') {
            fbq('track', 'ViewContent', productData, {
                eventID: vcEventId
            });
        }
        // TikTok Pixel (requires content_id for VSA)
        if (typeof ttq !== 'undefined') {
            ttq.track('ViewContent', {
                content_id: PD.productId,
                content_name: PD.productName,
                content_type: 'product',
                value: PD.price,
                currency: 'DZD'
            }, {
                event_id: vcEventId
            });
        }
        // Snapchat Pixel
        if (typeof snaptr !== 'undefined') {
            snaptr('track', 'VIEW_CONTENT', {
                item_ids: [PD.productId],
                price: PD.price,
                currency: 'DZD'
            });
        }
        // Pinterest Tag
        if (typeof pintrk !== 'undefined') {
            pintrk('track', 'pagevisit', productData);
        }
        // Google Analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'view_item', {
                items: [{
                    item_id: PD.productId,
                    item_name: PD.productName,
                    price: PD.price
                }]
            });
        }
    }
});

// Quantity functions
const trackStock = PD.trackStock;
const maxQty = PD.maxStock;
let selectedOffer = null;
const basePrice = PD.price;
const productComparePrice = PD.comparePrice;
const currencySymbol = PD.currencySymbol;
const storeLang = PD.storeLang;
const hasVariants = PD.hasVariants;
const productVariantsData = PD.variants;
const productImagesData = PD.imagePaths;
const variantCombinationsData = PD.combinations;
const combinationStockEnabled = PD.combinationStockEnabled;
const variantStockEnabled = !!PD.variantStockEnabled;

/**
 * Max orderable quantity for the CURRENT variant selection.
 *
 * PD.maxStock is the product-level total — in per-option stock mode the server
 * sums every option's stock into it, so on its own it lets a shopper order 12 of
 * an option that has 2 left. Every qty control clamps through here instead.
 *
 * Falls back to PD.maxStock (previous behaviour) whenever the selection can't be
 * resolved to a single stock number, so this can only ever tighten the cap.
 */
function getEffectiveMaxQty() {
    if (!trackStock) return maxQty;
    // Multi-qty offers carry one variant set PER PIECE (per-piece mode) and drive
    // the qty inputs themselves — leave that flow exactly as it was.
    if (selectedOffer) return maxQty;

    let cap = null;

    if (combinationStockEnabled && variantCombinationsData.length > 0) {
        // Cap by the matched combination, once the picks resolve to one.
        const sel = [];
        for (const gid in selectedVariants) {
            if (gid.indexOf('::') !== -1) continue; // selectable picks are outside the matrix
            const v = selectedVariants[gid];
            sel.push(v.groupName + '||' + v.optionName);
        }
        if (sel.length > 0) {
            sel.sort();
            const selKey = sel.join('|');
            let match = variantCombinationsData.find(combo => {
                const keys = combo.options.map(o => o.group_name + '||' + o.option_name);
                keys.sort();
                return keys.join('|') === selKey;
            });
            if (!match) {
                // Superset fallback — cascading variants store fewer dimensions
                // than the matrix (mirrors validateVariantStockServerSide).
                match = variantCombinationsData.find(combo => {
                    if (parseInt(combo.stock) <= 0) return false;
                    const set = combo.options.map(o => o.group_name + '||' + o.option_name);
                    return sel.every(s => set.indexOf(s) !== -1);
                });
            }
            if (match) cap = parseInt(match.stock) || 0;
        }
    } else if (variantStockEnabled) {
        // Per-option stock: one unit consumes one of EVERY selected option, so the
        // ceiling is the scarcest pick. data-stock="" means NULL = untracked.
        const scope = document.querySelector('.variants-section:not(#per-piece-variants)');
        if (scope) {
            scope.querySelectorAll('.color-swatch.selected, .text-option.selected, .image-text-option.selected')
                .forEach(btn => {
                    const raw = btn.getAttribute('data-stock');
                    if (raw === null || raw === '') return;
                    const s = parseInt(raw);
                    if (isNaN(s)) return;
                    if (cap === null || s < cap) cap = s;
                });
        }
    }

    if (cap === null) return maxQty;
    // cap 0 = sold out; those buttons are disabled, so never hand back 0 here.
    return Math.max(1, Math.min(maxQty, cap));
}

/**
 * Re-apply the cap after a variant pick: pull an over-cap quantity back down and
 * keep the native max= attributes in sync across all four qty inputs.
 */
function applyVariantQtyCap() {
    if (!trackStock) return;
    const cap = getEffectiveMaxQty();
    let val = null;
    ['quantity', 'fc_quantity', 'fbQtyDesktop', 'fbQtyMobile'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.setAttribute('max', cap);
        if ((parseInt(el.value) || 1) > cap) {
            el.value = cap;
            val = cap;
        }
    });
    if (val === null) return;
    // Deliberately NOT matchOfferByQty(): this reduction is a stock constraint, not
    // a quantity the shopper chose. Running it would silently apply a "buy N" offer
    // (changing the price) off a variant click — and offers re-open the cap.
    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
}

// Build offers lookup map: { quantity: offerCard element }
const offersMap = {};
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.offer-card').forEach(card => {
        const qty = parseInt(card.dataset.offerQuantity);
        offersMap[qty] = card;
    });
    // Initial availability paint: server-rendered options carry no combination
    // sold-out state, so without this first sweep every option looks orderable
    // until the shopper's first click.
    if (combinationStockEnabled && variantCombinationsData.length > 0 &&
        typeof updateCombinationOptionAvailability === 'function') {
        updateCombinationOptionAvailability();
    }
});

// Per-piece variant tracking: { pieceIndex: { groupId: { groupName, optionId, optionName, priceAdjustment, colorCode } } }
let perPieceVariants = {};
let perPieceMode = false;

// Initialize form load timestamp for bot protection
const fcPageLoadTime = Date.now();
const fcFormTimeEl = document.getElementById('fc_form_time');
if (fcFormTimeEl) fcFormTimeEl.value = '0';

// ====== Sequential Fast Checkout Field Guide ======
(function() {
    var guideTimer = null;
    var prevActive = null; // track which field was active before
    var fields = [{
            wrapper: 'fc_phone_wrapper',
            input: 'fc_phone',
            check: function() {
                var el = document.getElementById('fc_phone');
                if (!el) return false;
                var v = (el.value || '').replace(/\D/g, '');
                return /^0\d{9}$|^(?:00)?213\d{9}$|^(?:00)?2130[5-7]\d{8}$/.test(v);
            }
        },
        {
            wrapper: 'fc_name_wrapper',
            input: 'fc_name',
            check: function() {
                var el = document.getElementById('fc_name');
                return el && el.value && el.value.trim().length > 0;
            }
        },
        {
            wrapper: 'fc_wilaya_wrapper',
            input: 'fc_wilaya',
            check: function() {
                var el = document.getElementById('fc_wilaya');
                return el && el.value && el.value !== '';
            }
        },
        {
            wrapper: 'fc_commune_wrapper',
            input: 'fc_commune',
            check: function() {
                var el = document.getElementById('fc_commune');
                return el && el.value && el.value.trim().length > 0;
            }
        }
    ];

    function updateGuide() {
        var allDone = true;
        var activeSet = false;
        var nextInput = null;
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var w = document.getElementById(f.wrapper);
            if (!w) continue;
            var done = false;
            try {
                done = f.check();
            } catch (e) {}
            if (done) {
                w.classList.add('fc-guide-done');
                w.classList.remove('fc-guide-active');
            } else {
                w.classList.remove('fc-guide-done');
                if (!activeSet) {
                    w.classList.add('fc-guide-active');
                    nextInput = f.input;
                    activeSet = true;
                } else {
                    w.classList.remove('fc-guide-active');
                }
                allDone = false;
            }
        }
        // Auto-focus: only from fields with clear completion signals
        // Phone (10 digits) → focus name ✓
        // Wilaya (select change) → focus commune ✓
        // Name → do NOT auto-focus wilaya (user may still be typing)
        // Commune → do NOT auto-focus (just highlight button)
        if (nextInput && nextInput !== prevActive && prevActive) {
            // Only auto-focus when transitioning FROM phone or wilaya
            if (prevActive === 'fc_phone' || prevActive === 'fc_wilaya') {
                var nextEl = document.getElementById(nextInput);
                if (nextEl) {
                    setTimeout(function() {
                        nextEl.focus();
                        if (nextEl.scrollIntoView) {
                            nextEl.scrollIntoView({
                                behavior: 'smooth',
                                block: 'nearest'
                            });
                        }
                    }, 120);
                }
            }
        }
        prevActive = nextInput;
        // Animate submit button when all fields + delivery filled
        var btn = document.getElementById('btnFastCheckout');
        if (btn) {
            var deliveryOk = typeof selectedDeliveryType !== 'undefined' && !!selectedDeliveryType;
            if (allDone && deliveryOk) {
                btn.classList.add('fc-btn-ready');
            } else {
                btn.classList.remove('fc-btn-ready');
            }
        }
    }

    // Debounced version to avoid rapid DOM thrashing
    function scheduleGuide() {
        if (guideTimer) clearTimeout(guideTimer);
        guideTimer = setTimeout(updateGuide, 80);
    }

    document.addEventListener('DOMContentLoaded', function() {
        var ids = ['fc_phone', 'fc_name', 'fc_wilaya', 'fc_commune'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) {
                el.addEventListener('input', scheduleGuide);
                el.addEventListener('change', scheduleGuide);
            }
        }
        var radios = document.querySelectorAll('input[name="deliveryPlace"]');
        for (var j = 0; j < radios.length; j++) {
            radios[j].addEventListener('change', scheduleGuide);
        }
        // Initial state
        updateGuide();
    });

    window.updateFcGuide = updateGuide;
})();

// Initialize offer selection
document.addEventListener('DOMContentLoaded', function() {
    const offerCards = document.querySelectorAll('.offer-card');
    offerCards.forEach(card => {
        card.addEventListener('click', function() {
            selectOffer(this);
        });
    });

    // No offer pre-selected — product price shown initially.
    // User must explicitly select an offer to switch to offer pricing.
    selectedOffer = null;
});

function selectOffer(element) {
    // Remove selection from all
    document.querySelectorAll('.offer-card').forEach(card => {
        card.classList.remove('selected');
        card.querySelector('input[type="radio"]').checked = false;
    });

    // Select this one
    element.classList.add('selected');
    element.querySelector('input[type="radio"]').checked = true;

    // Update selected offer data
    selectedOffer = {
        id: element.dataset.offerId,
        price: parseFloat(element.dataset.offerPrice),
        quantity: parseInt(element.dataset.offerQuantity),
        comparePrice: parseFloat(element.dataset.offerComparePrice || 0),
        // a 100 % percent offer has factor 0; only a missing attribute falls back to 1
        adjFactor: isNaN(parseFloat(element.dataset.offerAdjFactor)) ? 1 : parseFloat(element.dataset.offerAdjFactor),
        freeShipping: parseInt(element.dataset.offerFreeShipping) || 0,
        title: (function() {
            var el = element.querySelector('.offer-title');
            return el ? el.textContent : '';
        })()
    };

    // Update quantity inputs to match offer quantity
    const qtyInput = document.getElementById('quantity');
    if (qtyInput) {
        qtyInput.value = selectedOffer.quantity;
        qtyInput.readOnly = true;
    }
    const fcQtyInput = document.getElementById('fc_quantity');
    if (fcQtyInput) {
        fcQtyInput.value = selectedOffer.quantity;
        fcQtyInput.readOnly = true;
    }
    // Sync floating bar steppers (+/− still navigates between offers via matchOfferByQty)
    const fbDesktop = document.getElementById('fbQtyDesktop');
    if (fbDesktop) fbDesktop.value = selectedOffer.quantity;
    const fbMobile = document.getElementById('fbQtyMobile');
    if (fbMobile) fbMobile.value = selectedOffer.quantity;

    // Update price display (include variant adjustment if any)
    const offerDisplayPrice = selectedOffer.price + getTotalVariantAdjustment();
    const priceEl = document.querySelector('.current-price');
    if (priceEl) {
        priceEl.textContent = numberFormat(offerDisplayPrice) + ' ' + currencySymbol;
    }

    // Update original price and discount badge
    const origPriceEl = document.querySelector('.original-price');
    const discountEl = document.querySelector('.discount-badge');
    if (selectedOffer.comparePrice > 0 && selectedOffer.comparePrice > selectedOffer.price) {
        const disc = Math.round(((selectedOffer.comparePrice - selectedOffer.price) / selectedOffer.comparePrice) * 100);
        if (origPriceEl) {
            origPriceEl.textContent = numberFormat(selectedOffer.comparePrice) + ' ' + currencySymbol;
            origPriceEl.style.display = '';
        } else {
            const span = document.createElement('span');
            span.className = 'original-price';
            span.textContent = numberFormat(selectedOffer.comparePrice) + ' ' + currencySymbol;
            priceEl.parentNode.insertBefore(span, priceEl.nextSibling);
        }
        if (discountEl) {
            discountEl.textContent = '-' + disc + '%';
            discountEl.style.display = '';
        } else {
            const badge = document.createElement('span');
            badge.className = 'discount-badge';
            badge.textContent = '-' + disc + '%';
            priceEl.parentNode.appendChild(badge);
        }
    } else {
        if (origPriceEl) origPriceEl.style.display = 'none';
        if (discountEl) discountEl.style.display = 'none';
    }

    // Update totals — if a wilaya is already selected, re-run full delivery
    // recalculation so shipping labels update immediately on offer switch
    const _fcWilaya = document.getElementById('fc_wilaya');
    if (_fcWilaya && _fcWilaya.value && typeof updateDeliveryOptions === 'function') {
        updateDeliveryOptions();
    } else {
        if (typeof updateTotal === 'function') updateTotal();
    }
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();

    // Handle per-piece variant selection for multi-quantity offers
    handlePerPieceVariants();
}

// Auto-match offer by quantity or deselect
function matchOfferByQty(qty) {
    const matchingCard = offersMap[qty];
    if (matchingCard) {
        // Quantity matches an offer — auto-select it
        selectOffer(matchingCard);
    } else if (selectedOffer) {
        // Quantity doesn't match any offer — deselect
        deselectOffer();
    }
}

// Deselect all offers and revert to normal product price
function deselectOffer() {
    selectedOffer = null;

    // Uncheck all offer cards
    document.querySelectorAll('.offer-card').forEach(card => {
        card.classList.remove('selected');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
    });

    // Re-enable quantity inputs
    const qtyInput = document.getElementById('quantity');
    if (qtyInput) qtyInput.readOnly = false;
    const fcQtyInput = document.getElementById('fc_quantity');
    if (fcQtyInput) fcQtyInput.readOnly = false;

    // Revert price display to normal product price
    const priceEl = document.querySelector('.current-price');
    const adjustedPrice = basePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0);
    if (priceEl) {
        priceEl.textContent = numberFormat(adjustedPrice) + ' ' + currencySymbol;
    }

    // Revert original price / discount badge to product's own compare price
    const origPriceEl = document.querySelector('.original-price');
    const discountEl = document.querySelector('.discount-badge');
    if (productComparePrice > 0 && productComparePrice > adjustedPrice) {
        const disc = Math.round(((productComparePrice - adjustedPrice) / productComparePrice) * 100);
        if (origPriceEl) {
            origPriceEl.textContent = numberFormat(productComparePrice) + ' ' + currencySymbol;
            origPriceEl.style.display = '';
        }
        if (discountEl) {
            discountEl.textContent = '-' + disc + '%';
            discountEl.style.display = '';
        }
    } else {
        if (origPriceEl) origPriceEl.style.display = 'none';
        if (discountEl) discountEl.style.display = 'none';
    }

    // Reset per-piece variants
    handlePerPieceVariants();

    // Update totals
    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
}

// Build/show per-piece variant selectors when offer qty > 1 and product has variants
function handlePerPieceVariants() {
    const container = document.getElementById('per-piece-variants');
    const normalVariants = document.querySelector('.variants-section');

    if (!container || !hasVariants || !selectedOffer) {
        // No offers or no variants - use normal mode
        if (container) container.style.display = 'none';
        if (normalVariants) normalVariants.style.display = '';
        perPieceMode = false;
        return;
    }

    const qty = selectedOffer.quantity;

    if (qty <= 1) {
        // Single quantity offer - use normal variant selection
        container.style.display = 'none';
        if (normalVariants) normalVariants.style.display = '';
        perPieceMode = false;
        return;
    }

    // Multi-quantity offer with variants -> switch to per-piece mode
    perPieceMode = true;
    if (normalVariants) normalVariants.style.display = 'none';
    container.style.display = '';

    // Reset per-piece selections
    perPieceVariants = {};

    // Build the UI
    const pieceLabel = storeLang === 'fr' ? 'Pièce' : 'القطعة';
    const selectLabel = storeLang === 'fr' ? 'Sélectionnez les variantes' : 'اختر الخصائص';
    const notSelected = storeLang === 'fr' ? 'Non sélectionné' : 'غير محدد';
    const completed = storeLang === 'fr' ? 'Terminé' : 'تم';
    const soldOutLabel = storeLang === 'fr' ? 'Épuisé' : 'نفذ';

    let html = `<div class="per-piece-header">
        <i class="bi bi-grid-3x3-gap"></i>
        <span>${selectLabel} (${qty} ${storeLang === 'fr' ? 'pièces' : 'قطع'})</span>
    </div>`;

    for (let p = 1; p <= qty; p++) {
        const isActive = p === 1;
        html += `<div class="piece-item${isActive ? ' active' : ''}" id="piece-${p}" data-piece="${p}">
            <div class="piece-header" onclick="togglePiece(${p})">
                <div class="piece-header-right">
                    <span class="piece-number">${p}</span>
                    <span class="piece-title">${pieceLabel} ${p}</span>
                </div>
                <div>
                    <span class="piece-status"><i class="bi bi-circle"></i> ${notSelected}</span>
                    <div class="piece-summary" id="piece-summary-${p}"></div>
                </div>
            </div>
            <div class="piece-body">`;

        // Render variant groups for this piece
        for (const group of productVariantsData) {
            const isSelectableGroup = group.type === 'selectable';
            html += `<div class="variant-group" data-group-id="${group.id}" data-group-name="${escHtml(group.name)}" data-group-type="${escHtml(group.type || 'text')}">
                <div class="variant-label">${escHtml(group.name)}${isSelectableGroup ? '' : ' <span class="text-danger">*</span>'}</div>`;

            if (group.type === 'color') {
                html += '<div class="color-swatches">';
                for (const opt of group.options) {
                    const soldOut = opt.is_sold_out ? true : false;
                    const imgIdx = (opt.image_index !== null && opt.image_index !== '' && opt.image_index !== undefined) ? parseInt(opt.image_index) : null;
                    const thumb = opt.pvo_image_path || ((imgIdx !== null && productImagesData[imgIdx]) ? productImagesData[imgIdx] : null);
                    const showAsCard = !!opt.show_as_card;
                    const hasThumb = !!thumb && showAsCard;
                    const adj = parseFloat(opt.price_adjustment) || 0;
                    const colorCode = opt.color_code || '#ccc';
                    const styleAttr = hasThumb ? '' : `background-color:${escHtml(colorCode)}`;
                    let pricePill = '';
                    if (adj !== 0) {
                        pricePill = `<span class="opt-price-pill${adj < 0 ? ' neg' : ''}">${adj > 0 ? '+' : ''}${adj} ${currencySymbol}</span>`;
                    }
                    let inner;
                    if (hasThumb) {
                        inner = `<span class="swatch-thumb-img" style="background-image:url('${escHtml(thumb)}')">
                            <span class="swatch-check"><i class="bi bi-check"></i></span>
                            ${pricePill}
                        </span>
                        <span class="swatch-meta">
                            <span class="swatch-color-dot" style="background-color:${escHtml(colorCode)}"></span>
                            <span class="swatch-label">${escHtml(opt.name)}</span>
                        </span>`;
                    } else {
                        inner = `<span class="swatch-check"><i class="bi bi-check"></i></span>
                        ${soldOut ? '<span class="swatch-soldout-line"></span>' : ''}
                        ${pricePill}`;
                    }
                    html += `<button type="button"
                        class="color-swatch${hasThumb ? ' has-thumb' : ''}${soldOut ? ' sold-out' : ''}"
                        style="${styleAttr}"
                        data-option-id="${opt.id}"
                        data-option-name="${escHtml(opt.name)}"
                        data-price-adjustment="${adj}"
                        data-color-code="${escHtml(opt.color_code || '')}"
                        data-image-index="${imgIdx !== null ? imgIdx : ''}"
                        data-stock="${opt.stock !== null && opt.stock !== undefined ? parseInt(opt.stock) : ''}"
                        onclick="selectPieceVariant(this, ${p})"
                        title="${escHtml(opt.name)}${soldOut ? ' - ' + soldOutLabel : ''}"
                        ${soldOut ? 'disabled' : ''}>
                        ${inner}
                    </button>`;
                }
                html += '</div>';
                html += `<div class="selected-variant-name" id="piece-selected-${p}-${group.id}"></div>`;
            } else if (group.type === 'image_text' || group.type === 'selectable') {
                // 'selectable' reuses the image_text card markup (incl. the .no-thumb
                // clean text tile) — multi-select behavior lives in selectPieceVariant.
                html += '<div class="image-text-options">';
                for (const opt of group.options) {
                    const soldOut = opt.is_sold_out ? true : false;
                    const imgIdx = (opt.image_index !== null && opt.image_index !== '' && opt.image_index !== undefined) ? parseInt(opt.image_index) : null;
                    const thumb = opt.pvo_image_path || ((imgIdx !== null && productImagesData[imgIdx]) ? productImagesData[imgIdx] : null);
                    const hasThumb = !!thumb;
                    const adj = parseFloat(opt.price_adjustment) || 0;
                    let pricePill = '';
                    if (adj !== 0) {
                        pricePill = `<span class="opt-price-pill${adj < 0 ? ' neg' : ''}">${adj > 0 ? '+' : ''}${adj} ${currencySymbol}</span>`;
                    }
                    html += `<button type="button"
                        class="image-text-option${hasThumb ? '' : ' no-thumb'}${soldOut ? ' sold-out' : ''}"
                        data-option-id="${opt.id}"
                        data-option-name="${escHtml(opt.name)}"
                        data-price-adjustment="${adj}"
                        data-image-index="${imgIdx !== null ? imgIdx : ''}"
                        data-stock="${opt.stock !== null && opt.stock !== undefined ? parseInt(opt.stock) : ''}"
                        onclick="selectPieceVariant(this, ${p})"
                        title="${escHtml(opt.name)}${soldOut ? ' - ' + soldOutLabel : ''}"
                        ${soldOut ? 'disabled' : ''}>
                        <span class="opt-thumb-img" ${hasThumb ? `style="background-image:url('${escHtml(thumb)}')"` : ''}>
                            <span class="opt-check"><i class="bi bi-check"></i></span>
                            ${pricePill}
                            <span class="opt-label">${escHtml(opt.name)}</span>
                        </span>
                    </button>`;
                }
                html += '</div>';
            } else {
                html += '<div class="text-options' + (group.type === 'dropdown' ? ' variant-dropdown-src' : '') + '">';
                for (const opt of group.options) {
                    const soldOut = opt.is_sold_out ? true : false;
                    const adj = parseFloat(opt.price_adjustment) || 0;
                    let priceTag = '';
                    if (adj !== 0) {
                        priceTag = `<span class="option-price${adj < 0 ? ' negative' : ''}">${adj > 0 ? '+' : ''}${adj} ${currencySymbol}</span>`;
                    }
                    html += `<button type="button"
                        class="text-option${soldOut ? ' sold-out' : ''}"
                        data-option-id="${opt.id}"
                        data-option-name="${escHtml(opt.name)}"
                        data-price-adjustment="${adj}"
                        data-stock="${opt.stock !== null && opt.stock !== undefined ? parseInt(opt.stock) : ''}"
                        onclick="selectPieceVariant(this, ${p})"
                        ${soldOut ? 'disabled' : ''}>
                        <span class="option-name">${escHtml(opt.name)}</span>${priceTag}
                    </button>`;
                }
                html += '</div>';
                if (group.type === 'dropdown') {
                    html += `<select class="variant-dropdown" data-group-id="${escHtml(String(group.id))}" aria-label="${escHtml(group.name)}" data-sold-out-label="${escHtml(soldOutLabel)}" onchange="selectVariantFromDropdown(this)">`;
                    html += `<option value="" disabled selected>${escHtml(group.name)}</option>`;
                    for (const opt of group.options) {
                        const adj = parseFloat(opt.price_adjustment) || 0;
                        const label = opt.name + (adj !== 0 ? ' (' + (adj > 0 ? '+' : '') + numberFormat(adj) + ' ' + currencySymbol + ')' : '');
                        html += `<option value="${escHtml(String(opt.id))}"${opt.is_sold_out ? ' disabled' : ''}>${escHtml(label + (opt.is_sold_out ? ' - ' + soldOutLabel : ''))}</option>`;
                    }
                    html += '</select>';
                }
            }
            html += '</div>';
        }

        html += `</div></div>`;
    }

    container.innerHTML = html;
    initVariantDropdownSync();

    // Auto-open first piece
    perPieceVariants = {};

    // Run initial availability check after building the UI
    updateAllPiecesAvailability();
}

function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    // innerHTML serialization escapes & < > only — quotes must be escaped too
    // because callers interpolate into double-quoted attributes and url('…')
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Multi-select ('selectable') groups store each pick under a composite key
 * "groupId::optionId" in the same selections map, so payload flattening and
 * price summing keep working unchanged. They are fully optional and never
 * participate in combination stock. These helpers centralize both rules.
 */
function countRequiredVariantGroups() {
    return productVariantsData.filter(g => g.type !== 'selectable').length;
}

function countSelectedRequiredGroups(sel) {
    let n = 0;
    for (const k in sel) {
        if (k.indexOf('::') === -1) n++;
    }
    return n;
}

function comboKeysFromSelections(sel) {
    const keys = [];
    for (const k in sel) {
        if (k.indexOf('::') !== -1) continue; // selectable picks never join combos
        keys.push(sel[k].groupName + '||' + sel[k].optionName);
    }
    return keys.sort();
}

/**
 * Count how many times each variant combination is consumed by completed pieces
 * (excluding a specific piece so we can check what's left for it).
 * Returns a map of combinationId -> usedCount.
 */
function getComboUsageExcluding(excludePieceIndex) {
    const usage = {};
    if (!combinationStockEnabled || variantCombinationsData.length === 0) return usage;

    for (const pIdx in perPieceVariants) {
        if (parseInt(pIdx) === excludePieceIndex) continue;
        const pieceSelections = perPieceVariants[pIdx];
        const requiredGroups = countRequiredVariantGroups();
        if (countSelectedRequiredGroups(pieceSelections) < requiredGroups) continue; // incomplete piece

        // Build the selection key for this piece (selectable picks excluded)
        const selKey = comboKeysFromSelections(pieceSelections).join('|');

        // Find matching combination
        const matched = variantCombinationsData.find(combo => {
            const comboKeys = combo.options.map(o => o.group_name + '||' + o.option_name).sort();
            return comboKeys.join('|') === selKey;
        });
        if (matched) {
            usage[matched.id] = (usage[matched.id] || 0) + 1;
        }
    }
    return usage;
}

/**
 * Count how many times each individual option is consumed by other pieces
 * (for variant_stock_enabled / individual option stock mode).
 * Returns a map of optionId -> usedCount.
 */
function getOptionUsageExcluding(excludePieceIndex) {
    const usage = {};
    for (const pIdx in perPieceVariants) {
        if (parseInt(pIdx) === excludePieceIndex) continue;
        const pieceSelections = perPieceVariants[pIdx];
        Object.values(pieceSelections).forEach(v => {
            usage[v.optionId] = (usage[v.optionId] || 0) + 1;
        });
    }
    return usage;
}

/**
 * Update option availability within a single piece's variant groups,
 * respecting combination stock and individual stock across all pieces.
 */
function updatePieceOptionAvailability(pieceIndex) {
    const pieceEl = document.getElementById('piece-' + pieceIndex);
    if (!pieceEl) return;

    const pieceGroups = pieceEl.querySelectorAll('.variant-group');
    const pieceSelections = perPieceVariants[pieceIndex] || {};

    // Combination stock mode
    if (combinationStockEnabled && variantCombinationsData.length > 0) {
        const comboUsage = getComboUsageExcluding(pieceIndex);

        pieceGroups.forEach(group => {
            // Selectable groups are outside the combination matrix — skip them here.
            if (group.dataset.groupType === 'selectable') return;
            const groupName = group.dataset.groupName;
            const buttons = group.querySelectorAll('.color-swatch, .text-option, .image-text-option');

            buttons.forEach(btn => {
                const optName = btn.dataset.optionName;
                const isColorSwatch = btn.classList.contains('color-swatch');

                // Check if any combination containing this option has remaining stock,
                // and is compatible with current selections in other groups of this piece.
                const isAvailable = variantCombinationsData.some(combo => {
                    const totalStock = parseInt(combo.stock) || 0;
                    const used = comboUsage[combo.id] || 0;
                    if (totalStock - used <= 0) return false;

                    const hasThisOption = combo.options.some(o =>
                        o.group_name === groupName && o.option_name === optName
                    );
                    if (!hasThisOption) return false;

                    // Check compatibility with other selected groups in this piece
                    for (const gid in pieceSelections) {
                        if (gid.indexOf('::') !== -1) continue; // selectable picks never join combos
                        const sel = pieceSelections[gid];
                        if (sel.groupName === groupName) continue;
                        const matchesOther = combo.options.some(o =>
                            o.group_name === sel.groupName && o.option_name === sel.optionName
                        );
                        if (!matchesOther) return false;
                    }
                    return true;
                });

                if (isAvailable) {
                    btn.disabled = false;
                    btn.classList.remove('sold-out');
                    btn.style.opacity = '';
                    const line = btn.querySelector('.swatch-soldout-line-dynamic');
                    if (line) line.remove();
                } else {
                    // If currently selected in this piece, deselect it
                    if (btn.classList.contains('selected')) {
                        btn.classList.remove('selected');
                        delete pieceSelections[group.dataset.groupId];
                        const nameDisplay = document.getElementById('piece-selected-' + pieceIndex + '-' + group.dataset.groupId);
                        if (nameDisplay) nameDisplay.textContent = '';
                        // Un-complete this piece
                        const pEl = document.getElementById('piece-' + pieceIndex);
                        if (pEl) {
                            pEl.classList.remove('completed');
                            const statusEl = pEl.querySelector('.piece-status');
                            const notSelected = storeLang === 'fr' ? 'Non sélectionné' : 'غير محدد';
                            if (statusEl) statusEl.innerHTML = '<i class="bi bi-circle"></i> ' + notSelected;
                            const summaryEl = document.getElementById('piece-summary-' + pieceIndex);
                            if (summaryEl) summaryEl.innerHTML = '';
                        }
                    }
                    btn.disabled = true;
                    btn.classList.add('sold-out');
                    btn.style.opacity = '';
                    if (isColorSwatch && !btn.querySelector('.swatch-soldout-line, .swatch-soldout-line-dynamic')) {
                        const line = document.createElement('span');
                        line.className = 'swatch-soldout-line swatch-soldout-line-dynamic';
                        btn.appendChild(line);
                    }
                }
            });
        });
        return; // combination mode handled
    }

    // Individual option stock mode: track usage across pieces
    const optionUsage = getOptionUsageExcluding(pieceIndex);

    pieceGroups.forEach(group => {
        const buttons = group.querySelectorAll('.color-swatch, .text-option, .image-text-option');

        buttons.forEach(btn => {
            const stockAttr = btn.dataset.stock;
            if (stockAttr === '' || stockAttr === undefined || stockAttr === null) return; // unlimited stock

            const totalStock = parseInt(stockAttr) || 0;
            const used = optionUsage[btn.dataset.optionId] || 0;
            const remaining = totalStock - used;
            const isColorSwatch = btn.classList.contains('color-swatch');

            if (remaining > 0) {
                // Available (unless originally sold out at 0 stock)
                if (totalStock > 0) {
                    btn.disabled = false;
                    btn.classList.remove('sold-out');
                    btn.style.opacity = '';
                    const line = btn.querySelector('.swatch-soldout-line-dynamic');
                    if (line) line.remove();
                }
            } else {
                // Stock depleted by other pieces
                if (btn.classList.contains('selected')) {
                    btn.classList.remove('selected');
                    const gid = group.dataset.groupType === 'selectable' ?
                        group.dataset.groupId + '::' + btn.dataset.optionId :
                        group.dataset.groupId;
                    delete pieceSelections[gid];
                    const nameDisplay = document.getElementById('piece-selected-' + pieceIndex + '-' + gid);
                    if (nameDisplay) nameDisplay.textContent = '';
                    const pEl = document.getElementById('piece-' + pieceIndex);
                    if (pEl) {
                        pEl.classList.remove('completed');
                        const statusEl = pEl.querySelector('.piece-status');
                        const notSelected = storeLang === 'fr' ? 'Non sélectionné' : 'غير محدد';
                        if (statusEl) statusEl.innerHTML = '<i class="bi bi-circle"></i> ' + notSelected;
                        const summaryEl = document.getElementById('piece-summary-' + pieceIndex);
                        if (summaryEl) summaryEl.innerHTML = '';
                    }
                }
                btn.disabled = true;
                btn.classList.add('sold-out');
                btn.style.opacity = '';
                if (isColorSwatch && !btn.querySelector('.swatch-soldout-line, .swatch-soldout-line-dynamic')) {
                    const line = document.createElement('span');
                    line.className = 'swatch-soldout-line swatch-soldout-line-dynamic';
                    btn.appendChild(line);
                }
            }
        });
    });
}

/**
 * Update availability for ALL pieces — called after any piece selection changes.
 */
function updateAllPiecesAvailability() {
    if (!perPieceMode || !selectedOffer) return;
    const qty = selectedOffer.quantity;
    for (let p = 1; p <= qty; p++) {
        updatePieceOptionAvailability(p);
    }
}

function togglePiece(pieceIndex) {
    const allPieces = document.querySelectorAll('#per-piece-variants .piece-item');
    allPieces.forEach(item => {
        if (parseInt(item.dataset.piece) === pieceIndex) {
            item.classList.toggle('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function selectPieceVariant(btn, pieceIndex) {
    const group = btn.closest('.variant-group');
    const groupId = group.dataset.groupId;
    const groupName = group.dataset.groupName;

    // Remove error state
    group.classList.remove('error');

    if (!perPieceVariants[pieceIndex]) perPieceVariants[pieceIndex] = {};

    // Multi-select ('selectable') group: toggle under a composite key — no sibling deselect.
    if (group.dataset.groupType === 'selectable') {
        const mKey = groupId + '::' + btn.dataset.optionId;
        if (btn.classList.contains('selected')) {
            btn.classList.remove('selected');
            delete perPieceVariants[pieceIndex][mKey];
        } else {
            btn.classList.add('selected');
            perPieceVariants[pieceIndex][mKey] = {
                groupName: groupName,
                optionId: btn.dataset.optionId,
                optionName: btn.dataset.optionName,
                priceAdjustment: parseFloat(btn.dataset.priceAdjustment) || 0,
                colorCode: btn.dataset.colorCode || null
            };
        }
        updateAllPiecesAvailability();
        if (selectedOffer) {
            const offerWithVariants = selectedOffer.price + getTotalVariantAdjustment();
            document.querySelectorAll('.current-price').forEach(el => {
                el.textContent = numberFormat(offerWithVariants) + ' ' + currencySymbol;
            });
            if (typeof updateTotal === 'function') updateTotal();
            if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
        }
        return;
    }

    // Remove selection from siblings in this piece's group
    group.querySelectorAll('.color-swatch, .text-option, .image-text-option').forEach(s => s.classList.remove('selected'));
    btn.classList.add('selected');

    // Store per-piece variant
    perPieceVariants[pieceIndex][groupId] = {
        groupName: groupName,
        optionId: btn.dataset.optionId,
        optionName: btn.dataset.optionName,
        priceAdjustment: parseFloat(btn.dataset.priceAdjustment) || 0,
        colorCode: btn.dataset.colorCode || null
    };

    // Update selected name display for colors — skip when card-rendered (label is already in the card)
    const nameDisplay = document.getElementById(`piece-selected-${pieceIndex}-${groupId}`);
    if (nameDisplay) {
        const isCardBtn = btn.classList.contains('has-thumb') || btn.classList.contains('image-text-option');
        nameDisplay.textContent = isCardBtn ? '' : btn.dataset.optionName;
    }

    // Update availability across all pieces after selection change
    updateAllPiecesAvailability();

    // Update displayed price and totals with new per-piece variant adjustment
    if (selectedOffer) {
        const offerWithVariants = selectedOffer.price + getTotalVariantAdjustment();
        document.querySelectorAll('.current-price').forEach(el => {
            el.textContent = numberFormat(offerWithVariants) + ' ' + currencySymbol;
        });
        if (typeof updateTotal === 'function') updateTotal();
        if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    }

    // Check if all groups are selected for this piece (selectable groups are optional)
    const requiredGroups = countRequiredVariantGroups();
    const selectedGroups = countSelectedRequiredGroups(perPieceVariants[pieceIndex] || {});
    const pieceEl = document.getElementById(`piece-${pieceIndex}`);

    if (selectedGroups >= requiredGroups) {
        // Mark as completed
        pieceEl.classList.add('completed');

        // Update status
        const statusEl = pieceEl.querySelector('.piece-status');
        const completeText = storeLang === 'fr' ? 'Terminé' : 'تم';
        if (statusEl) statusEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> ${completeText}`;

        // Show summary tags
        const summaryEl = document.getElementById(`piece-summary-${pieceIndex}`);
        if (summaryEl) {
            let tags = '';
            Object.values(perPieceVariants[pieceIndex]).forEach(v => {
                const dotHtml = v.colorCode ? `<span class="ps-dot" style="background:${escHtml(v.colorCode)}"></span>` : '';
                tags += `<span class="ps-tag">${dotHtml}${escHtml(v.optionName)}</span>`;
            });
            summaryEl.innerHTML = tags;
        }

        // Auto-advance to next incomplete piece
        const nextPiece = pieceIndex + 1;
        const nextEl = document.getElementById(`piece-${nextPiece}`);
        if (nextEl && !nextEl.classList.contains('completed')) {
            setTimeout(() => {
                pieceEl.classList.remove('active');
                nextEl.classList.add('active');
                nextEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }, 300);
        }
    }
}

function validatePerPieceVariants() {
    if (!perPieceMode || !selectedOffer) return true;

    const qty = selectedOffer.quantity;
    let firstMissingPiece = null;

    for (let p = 1; p <= qty; p++) {
        const selected = perPieceVariants[p] || {};
        const requiredGroups = countRequiredVariantGroups();

        if (countSelectedRequiredGroups(selected) < requiredGroups) {
            // Find which groups are missing
            const pieceEl = document.getElementById(`piece-${p}`);
            if (pieceEl) {
                // Highlight missing groups (selectable groups are optional)
                pieceEl.querySelectorAll('.variant-group').forEach(g => {
                    if (g.dataset.groupType === 'selectable') return;
                    const gid = g.dataset.groupId;
                    if (!selected[gid]) g.classList.add('error');
                });

                // Open this piece
                pieceEl.classList.add('active');

                if (!firstMissingPiece) firstMissingPiece = pieceEl;
            }
        }
    }

    if (firstMissingPiece) {
        firstMissingPiece.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        const msg = storeLang === 'fr' ?
            'Veuillez sélectionner les variantes pour chaque pièce' :
            'يرجى اختيار الخصائص لكل قطعة';
        showToast(msg, 'error');
        return false;
    }

    // Combination stock safety check: ensure total usage doesn't exceed stock
    if (combinationStockEnabled && variantCombinationsData.length > 0) {
        const comboUsage = {};
        for (let p = 1; p <= qty; p++) {
            const sel = perPieceVariants[p] || {};
            const selKeys = comboKeysFromSelections(sel);
            const selKey = selKeys.join('|');

            let matched = variantCombinationsData.find(combo => {
                const comboKeys = combo.options.map(o => o.group_name + '||' + o.option_name).sort();
                return comboKeys.join('|') === selKey;
            });
            // Cascading products: the piece's picks can be a SUBSET of the matrix
            // dimensions — fall back to any in-stock superset combo (mirrors
            // validateVariants; exact match above always wins).
            if (!matched) {
                matched = variantCombinationsData.find(combo => {
                    if (parseInt(combo.stock) <= 0) return false;
                    const set = combo.options.map(o => o.group_name + '||' + o.option_name);
                    return selKeys.every(k => set.indexOf(k) !== -1);
                });
            }

            if (!matched || parseInt(matched.stock) <= 0) {
                const msg = storeLang === 'fr' ?
                    'Certaines combinaisons sélectionnées sont en rupture de stock' :
                    'بعض التوليفات المختارة غير متوفرة';
                showToast(msg, 'error');
                return false;
            }

            comboUsage[matched.id] = (comboUsage[matched.id] || 0) + 1;
            if (comboUsage[matched.id] > parseInt(matched.stock)) {
                const msg = storeLang === 'fr' ?
                    'Stock insuffisant pour les combinaisons choisies' :
                    'المخزون غير كافٍ للتوليفات المختارة';
                showToast(msg, 'error');
                return false;
            }
        }
    }

    return true;
}

// Build per-piece variants payload for order submission
function getPerPieceVariantsPayload() {
    if (!perPieceMode || !selectedOffer) return null;
    const result = {};
    for (let p = 1; p <= selectedOffer.quantity; p++) {
        result[p] = Object.values(perPieceVariants[p] || {});
    }
    return result;
}

function numberFormat(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Get total variant price adjustment — works for both normal and per-piece modes
function getTotalVariantAdjustment() {
    // Percent-off offers discount the combined price, so adjustments scale too
    const factor = selectedOffer && typeof selectedOffer.adjFactor === 'number' ? selectedOffer.adjFactor : 1;
    if (perPieceMode && selectedOffer) {
        let total = 0;
        for (let p = 1; p <= selectedOffer.quantity; p++) {
            const pieceVars = perPieceVariants[p] || {};
            Object.values(pieceVars).forEach(v => {
                total += v.priceAdjustment || 0;
            });
        }
        return total * factor;
    }
    return (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0) * factor;
}

function getProductPrice() {
    if (selectedOffer) {
        return selectedOffer.price;
    }
    return basePrice;
}

function clampQtyInput(input) {
    // Remove non-numeric characters
    input.value = input.value.replace(/[^0-9]/g, '');
    let val = parseInt(input.value) || 0;
    const cap = getEffectiveMaxQty();
    if (trackStock && val > cap) {
        val = cap;
        input.value = val;
    }
    if (val >= 1) {
        // Auto-match offer by quantity
        matchOfferByQty(val);
        // Sync with fast checkout quantity
        const fcInput = document.getElementById('fc_quantity');
        if (fcInput) fcInput.value = val;
        // Sync floating bar quantities
        const fbD = document.getElementById('fbQtyDesktop');
        const fbM = document.getElementById('fbQtyMobile');
        if (fbD) fbD.value = val;
        if (fbM) fbM.value = val;
        if (typeof updateTotal === 'function') updateTotal();
        if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
        if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
    }
}

function changeQty(delta) {
    const input = document.getElementById('quantity');
    if (!input) return;

    let val = parseInt(input.value) + delta;
    if (val < 1) val = 1;
    const cap = getEffectiveMaxQty();
    if (val > cap) val = cap;
    input.value = val;

    // Auto-match offer by quantity
    matchOfferByQty(val);

    // Sync with fast checkout quantity
    const fcInput = document.getElementById('fc_quantity');
    if (fcInput) fcInput.value = val;
    // Sync floating bar quantities
    const fbD = document.getElementById('fbQtyDesktop');
    const fbM = document.getElementById('fbQtyMobile');
    if (fbD) fbD.value = val;
    if (fbM) fbM.value = val;

    // Update totals, shipping progress, and delivery options
    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
}

// Fast checkout quantity clamp for manual input
function clampFcQtyInput(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    let val = parseInt(input.value) || 0;
    const cap = getEffectiveMaxQty();
    if (trackStock && val > cap) {
        val = cap;
        input.value = val;
    }
    if (val >= 1) {
        // Auto-match offer by quantity
        matchOfferByQty(val);
        const mainInput = document.getElementById('quantity');
        if (mainInput) mainInput.value = val;
        // Sync floating bar quantities
        const fbD = document.getElementById('fbQtyDesktop');
        const fbM = document.getElementById('fbQtyMobile');
        if (fbD) fbD.value = val;
        if (fbM) fbM.value = val;
        if (typeof updateTotal === 'function') updateTotal();
        if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
        if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
    }
}

// Fast checkout quantity function
function changeFcQty(delta) {
    const fcInput = document.getElementById('fc_quantity');
    const mainInput = document.getElementById('quantity');
    if (!fcInput) return;

    let val = parseInt(fcInput.value) + delta;
    if (val < 1) val = 1;
    const cap = getEffectiveMaxQty();
    if (trackStock && val > cap) val = cap;
    fcInput.value = val;
    if (mainInput) mainInput.value = val;
    // Sync floating bar quantities
    const fbD = document.getElementById('fbQtyDesktop');
    const fbM = document.getElementById('fbQtyMobile');
    if (fbD) fbD.value = val;
    if (fbM) fbM.value = val;

    // Auto-match offer by quantity
    matchOfferByQty(val);

    // Update totals, shipping progress, and delivery options
    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
}

// Floating bar quantity: sync all qty inputs (main, fast checkout, floating bar)
function changeFbQty(delta) {
    const mainInput = document.getElementById('quantity');
    const fcInput = document.getElementById('fc_quantity');
    const fbDesktop = document.getElementById('fbQtyDesktop');
    const fbMobile = document.getElementById('fbQtyMobile');
    // Get current value from whichever input exists
    const current = parseInt((mainInput || fbDesktop || fbMobile || {}).value) || 1;
    let val = current + delta;
    if (val < 1) val = 1;
    const cap = getEffectiveMaxQty();
    if (trackStock && val > cap) val = cap;
    // Sync all quantity inputs
    if (mainInput) mainInput.value = val;
    if (fcInput) fcInput.value = val;
    if (fbDesktop) fbDesktop.value = val;
    if (fbMobile) fbMobile.value = val;
    // Auto-match offer
    matchOfferByQty(val);
    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
}

function syncFbQty(input) {
    input.value = input.value.replace(/[^0-9]/g, '');
    let val = parseInt(input.value) || 0;
    const cap = getEffectiveMaxQty();
    if (trackStock && val > cap) {
        val = cap;
        input.value = val;
    }
    if (val < 1) return;
    const mainInput = document.getElementById('quantity');
    const fcInput = document.getElementById('fc_quantity');
    const fbDesktop = document.getElementById('fbQtyDesktop');
    const fbMobile = document.getElementById('fbQtyMobile');
    if (mainInput) mainInput.value = val;
    if (fcInput) fcInput.value = val;
    if (fbDesktop && fbDesktop !== input) fbDesktop.value = val;
    if (fbMobile && fbMobile !== input) fbMobile.value = val;
    matchOfferByQty(val);
    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
}

// Fullscreen gallery
// Lazy-hydrate the fullscreen (zoom) images on first open so the ~1600px hi-res
// variants never download on initial page load (they live in a display:none modal
// ~95% of mobile shoppers never open). Covers Swiper loop-clone slides — the
// selector matches originals AND .swiper-slide-duplicate, both carry data-fs-src.
function hydrateFullscreenImages() {
    if (window.__fsHydrated) return;
    window.__fsHydrated = true;
    var imgs = document.querySelectorAll('.fullscreen-swiper img[data-fs-src]');
    for (var i = 0; i < imgs.length; i++) {
        if (!imgs[i].getAttribute('src')) {
            imgs[i].src = imgs[i].getAttribute('data-fs-src');
        }
    }
    // Let Swiper recompute zoom geometry once the hi-res images begin loading.
    if (fullscreenSwiper && typeof fullscreenSwiper.update === 'function') {
        try {
            fullscreenSwiper.update();
        } catch (e) {}
    }
}

function openFullscreen(index = 0) {
    hydrateFullscreenImages();
    document.getElementById('fullscreenModal').classList.add('active');
    if (fullscreenSwiper && fullscreenSwiper.params && fullscreenSwiper.params.loop && fullscreenSwiper.slideToLoop) {
        fullscreenSwiper.slideToLoop(index, 0);
    } else if (fullscreenSwiper) {
        fullscreenSwiper.slideTo(index, 0);
    }
    document.body.style.overflow = 'hidden';
}

function closeFullscreen() {
    document.getElementById('fullscreenModal').classList.remove('active');
    document.body.style.overflow = '';
}

// Close fullscreen on escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeFullscreen();
});

// Cart storage key - use store slug for consistency with cart page
const cartKey = ('cart_' + PD.storeSlug);

// Product variants state (basePrice already declared above)
let selectedVariants = {};
let variantPriceAdjustment = 0;

// Free shipping threshold
const freeShippingThreshold = PD.freeShippingThreshold;
const hasFreeShipping = PD.freeShipping;

// Update free shipping progress bar
function updateFreeShippingProgress() {
    // Skip if store has unconditional free shipping or no threshold set
    if (hasFreeShipping || freeShippingThreshold <= 0) return;

    const progressBar = document.getElementById('fcShippingProgress');
    if (!progressBar) return;

    // Get quantity from either selector
    const fcQtyInput = document.getElementById('fc_quantity');
    const mainQtyInput = document.getElementById('quantity');
    const qty = parseInt(_val(fcQtyInput) || _val(mainQtyInput) || 1);

    // Calculate order total - use offer price if selected (offer price is total, not per unit)
    let orderTotal;
    if (selectedOffer) {
        orderTotal = selectedOffer.price + getTotalVariantAdjustment();
    } else {
        const currentPrice = (typeof basePrice !== 'undefined' ? basePrice : 0) +
            (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0);
        orderTotal = currentPrice * qty;
    }

    const progressFill = document.getElementById('fcProgressFill');
    const shippingLabel = document.getElementById('fcShippingLabel');
    const celebration = document.getElementById('fcCelebration');
    const targetAmount = document.getElementById('fcShippingTarget');

    if (!progressFill || !shippingLabel) return;

    const percentage = Math.min(100, (orderTotal / freeShippingThreshold) * 100);
    const remaining = Math.max(0, freeShippingThreshold - orderTotal);

    // Update progress bar width with animation
    progressFill.style.width = percentage + '%';

    // Update target display
    if (targetAmount) {
        targetAmount.innerHTML = '<strong>' + String(Math.round((orderTotal) * 100) / 100) + '</strong> / ' + String(Math.round((freeShippingThreshold) * 100) / 100) + ' ' + currencySymbol;
    }

    if (orderTotal >= freeShippingThreshold) {
        // Success! Free shipping unlocked
        progressBar.classList.add('fc-shipping-success');
        shippingLabel.innerHTML = storeLang === 'fr' ? '🎉 Félicitations! Livraison gratuite!' : '🎉 مبروك! حصلت على شحن مجاني!';
        if (celebration) celebration.style.display = 'block';
    } else {
        // Still need more
        progressBar.classList.remove('fc-shipping-success');
        const remainingFormatted = String(Math.round((remaining) * 100) / 100);
        shippingLabel.innerHTML = storeLang === 'fr' ?
            '🚚 Ajoutez <strong>' + remainingFormatted + '</strong> ' + currencySymbol + ' pour la livraison gratuite' :
            '🚚 أضف <strong>' + remainingFormatted + '</strong> ' + currencySymbol + ' للشحن المجاني';
        if (celebration) celebration.style.display = 'none';
    }
}

// Variant selection
function selectVariantFromDropdown(sel) {
    const group = sel.closest('.variant-group');
    const btn = Array.from(group.querySelectorAll('.variant-dropdown-src .text-option')).find(b => b.dataset.optionId === sel.value);
    if (!btn || btn.disabled || btn.classList.contains('sold-out')) return;
    if (group.closest('#per-piece-variants')) {
        selectPieceVariant(btn, parseInt(group.closest('.piece-item').dataset.piece, 10));
    } else {
        selectVariant(btn);
    }
}

function initVariantDropdownSync() {
    document.querySelectorAll('.variant-dropdown').forEach(sel => {
        if (sel.dataset.dropdownSync) return;
        const source = sel.closest('.variant-group').querySelector('.variant-dropdown-src');
        const options = new Map(Array.from(sel.options, opt => [opt.value, opt]));
        const sync = () => {
            let selected = '';
            source.querySelectorAll('.text-option').forEach(btn => {
                const opt = options.get(btn.dataset.optionId);
                if (!opt) return;
                const adj = parseFloat(btn.dataset.priceAdjustment) || 0;
                const soldOut = btn.disabled || btn.classList.contains('sold-out');
                const label = btn.dataset.optionName + (adj !== 0 ? ' (' + (adj > 0 ? '+' : '') + numberFormat(adj) + ' ' + currencySymbol + ')' : '');
                opt.disabled = soldOut;
                opt.textContent = (btn.classList.contains('variant-incompatible') ? '⚠ ' : '') + label + (soldOut ? ' - ' + sel.dataset.soldOutLabel : '');
                if (btn.classList.contains('selected')) selected = btn.dataset.optionId;
            });
            sel.value = selected;
        };
        new MutationObserver(sync).observe(source, {
            attributes: true,
            attributeFilter: ['class', 'disabled'],
            subtree: true
        });
        sel.dataset.dropdownSync = '1';
        sync();
    });
}

document.addEventListener('DOMContentLoaded', initVariantDropdownSync);

function selectVariant(btn) {
    const group = btn.closest('.variant-group');
    const groupId = group.dataset.groupId;
    const groupName = group.dataset.groupName;

    // Remove error state when variant is selected
    group.classList.remove('error');

    // Multi-select ('selectable') group: toggle this option on/off under a
    // composite "groupId::optionId" key — no sibling deselect, no single slot.
    if (group.dataset.groupType === 'selectable') {
        const mKey = groupId + '::' + btn.dataset.optionId;
        if (btn.classList.contains('selected')) {
            btn.classList.remove('selected');
            delete selectedVariants[mKey];
        } else {
            btn.classList.add('selected');
            selectedVariants[mKey] = {
                groupName: groupName,
                optionId: btn.dataset.optionId,
                optionName: btn.dataset.optionName,
                priceAdjustment: parseFloat(btn.dataset.priceAdjustment) || 0,
                colorCode: btn.dataset.colorCode || null
            };
        }
        updateVariantPrice();
        applyVariantQtyCap();
        return;
    }

    // Remove selection from siblings
    const siblings = group.querySelectorAll('.color-swatch, .text-option, .image-text-option');
    siblings.forEach(s => s.classList.remove('selected'));

    // Add selection to clicked
    btn.classList.add('selected');

    // Store selected variant
    selectedVariants[groupId] = {
        groupName: groupName,
        optionId: btn.dataset.optionId,
        optionName: btn.dataset.optionName,
        priceAdjustment: parseFloat(btn.dataset.priceAdjustment) || 0,
        colorCode: btn.dataset.colorCode || null
    };

    // Combination mode: the option the shopper just clicked ALWAYS wins. Clear
    // any selection in OTHER groups that has no in-stock combination with the
    // just-picked option, so they can never dead-end. Example: picked
    // "14 Pro" + "Red", then taps "14" (which has no Red) — instead of "14"
    // being unclickable, "Red" is cleared and the valid colors for "14" re-open.
    if (combinationStockEnabled && variantCombinationsData.length > 0) {
        const newOptName = btn.dataset.optionName;
        for (const otherGid in selectedVariants) {
            if (otherGid === groupId) continue;
            if (otherGid.indexOf('::') !== -1) continue; // selectable picks never conflict with combos
            const other = selectedVariants[otherGid];
            const stillValid = variantCombinationsData.some(combo => {
                if (parseInt(combo.stock) <= 0) return false;
                const hasNew = combo.options.some(o =>
                    o.group_name === groupName && o.option_name === newOptName);
                const hasOther = combo.options.some(o =>
                    o.group_name === other.groupName && o.option_name === other.optionName);
                return hasNew && hasOther;
            });
            if (!stillValid) {
                delete selectedVariants[otherGid];
                const otherGroupEl = document.querySelector(
                    '.variants-section .variant-group[data-group-id="' + otherGid + '"]');
                if (otherGroupEl) {
                    otherGroupEl.querySelectorAll('.color-swatch.selected, .text-option.selected, .image-text-option.selected')
                        .forEach(s => s.classList.remove('selected'));
                }
                const otherNameDisplay = document.getElementById('selected-' + otherGid);
                if (otherNameDisplay) otherNameDisplay.textContent = '';
            }
        }
    }

    // Update selected name display for colors — skip when card-rendered
    const nameDisplay = document.getElementById('selected-' + groupId);
    if (nameDisplay) {
        const isCardBtn = btn.classList.contains('has-thumb') || btn.classList.contains('image-text-option');
        nameDisplay.textContent = isCardBtn ? '' : btn.dataset.optionName;
    }

    // Swipe to linked image if this variant has an image_index.
    const imageIndex = btn.dataset.imageIndex;
    if (imageIndex !== '' && imageIndex !== undefined && imageIndex !== null) {
        const slideIndex = parseInt(imageIndex);
        if (!isNaN(slideIndex)) {
            if (PD.stackedLayout) {
                // Stacked layout: scroll to the variant's image — but ONLY at ≥768px,
                // where the gallery sits BESIDE the variants (non-disruptive). On mobile
                // (1-column, gallery ABOVE the variants) this would yank the shopper up
                // away from the selector, so we skip the scroll there. Desktop unchanged.
                const stackedImg = document.getElementById('stacked-img-' + slideIndex);
                if (stackedImg && window.matchMedia('(min-width: 768px)').matches) {
                    stackedImg.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            } else {
                // Carousel layout: slide to image. Under loop mode slideTo() addresses
                // the rotating activeIndex space — slideToLoop() targets the stable
                // realIndex the data-image-index refers to.
                if (typeof mainSwiper !== 'undefined' && mainSwiper) {
                    if (mainSwiper.params && mainSwiper.params.loop && mainSwiper.slideToLoop) {
                        mainSwiper.slideToLoop(slideIndex);
                    } else {
                        mainSwiper.slideTo(slideIndex);
                    }
                }
            }
        }
    }

    // Recalculate price
    updateVariantPrice();

    // Update which options are available based on combination stock. The length
    // guard matches every other combination-mode branch — with an empty matrix
    // the availability probe would mark every option sold-out.
    if (combinationStockEnabled && variantCombinationsData.length > 0) {
        updateCombinationOptionAvailability();
    }

    // Last — updateCombinationOptionAvailability() can clear a now-invalid pick,
    // so the qty ceiling has to be recomputed after it settles.
    applyVariantQtyCap();
}

function updateVariantPrice() {
    variantPriceAdjustment = 0;
    Object.values(selectedVariants).forEach(v => {
        variantPriceAdjustment += v.priceAdjustment;
    });

    // If offer is selected, show offer price + variant adjustment; otherwise base + variant
    const displayPrice = selectedOffer ?
        selectedOffer.price + getTotalVariantAdjustment() + (typeof addonPriceAdjustment !== 'undefined' ? addonPriceAdjustment : 0) :
        basePrice + variantPriceAdjustment + (typeof addonPriceAdjustment !== 'undefined' ? addonPriceAdjustment : 0);

    // Update displayed price
    document.querySelectorAll('.current-price').forEach(el => {
        el.textContent = String(Math.round((displayPrice) * 100) / 100) + ' ' + currencySymbol;
    });

    // Update fast checkout total
    if (typeof updateTotal === 'function') updateTotal();

    // Update free shipping progress
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();

    // Update delivery options (for free shipping threshold check)
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
}

/**
 * After a variant is selected, disable options in other groups that would
 * lead to an out-of-stock or nonexistent combination — styled exactly
 * like the native "sold out" look (strikethrough / diagonal red line).
 */
function updateCombinationOptionAvailability() {
    const variantGroups = document.querySelectorAll('.variants-section .variant-group');

    // Remove old sold-out message if any
    const oldMsg = document.getElementById('combination-sold-out-msg');
    if (oldMsg) oldMsg.remove();

    variantGroups.forEach(group => {
        // Selectable groups are outside the combination matrix — leave their
        // buttons on their own per-option sold-out state.
        if (group.dataset.groupType === 'selectable') return;
        const groupName = group.dataset.groupName;
        const buttons = group.querySelectorAll('.color-swatch, .text-option, .image-text-option');

        buttons.forEach(btn => {
            const optName = btn.dataset.optionName;
            const isColorSwatch = btn.classList.contains('color-swatch');

            const removeDynamicLine = () => {
                btn.querySelectorAll('.swatch-soldout-line-dynamic, .swatch-incompat-line').forEach(l => l.remove());
            };

            // HARD sold-out: this option exists in NO in-stock combination at all,
            // regardless of what's selected elsewhere — genuinely unorderable.
            const existsInStock = variantCombinationsData.some(combo =>
                parseInt(combo.stock) > 0 &&
                combo.options.some(o => o.group_name === groupName && o.option_name === optName)
            );

            // COMPATIBLE: an in-stock combination contains this option AND matches
            // the current selections in every OTHER group.
            const compatible = existsInStock && variantCombinationsData.some(combo => {
                if (parseInt(combo.stock) <= 0) return false;
                const hasThisOption = combo.options.some(o =>
                    o.group_name === groupName && o.option_name === optName);
                if (!hasThisOption) return false;
                for (const gid in selectedVariants) {
                    if (gid.indexOf('::') !== -1) continue; // selectable picks never join combos
                    const sel = selectedVariants[gid];
                    if (sel.groupName === groupName) continue;
                    const matchesOther = combo.options.some(o =>
                        o.group_name === sel.groupName && o.option_name === sel.optionName);
                    if (!matchesOther) return false;
                }
                return true;
            });

            if (!existsInStock) {
                // Truly sold out — keep unclickable with the red strike-line.
                if (btn.classList.contains('selected')) {
                    btn.classList.remove('selected');
                    delete selectedVariants[group.dataset.groupId];
                    const nameDisplay = document.getElementById('selected-' + group.dataset.groupId);
                    if (nameDisplay) nameDisplay.textContent = '';
                }
                btn.classList.remove('variant-incompatible');
                const incompatLine = btn.querySelector('.swatch-incompat-line');
                if (incompatLine) incompatLine.remove();
                btn.disabled = true;
                btn.classList.add('sold-out');
                btn.style.opacity = '';
                if (isColorSwatch && !btn.querySelector('.swatch-soldout-line, .swatch-soldout-line-dynamic')) {
                    const line = document.createElement('span');
                    line.className = 'swatch-soldout-line swatch-soldout-line-dynamic';
                    btn.appendChild(line);
                }
            } else if (compatible) {
                // Fully available with the current picks.
                btn.disabled = false;
                btn.classList.remove('sold-out');
                btn.classList.remove('variant-incompatible');
                btn.style.opacity = '';
                removeDynamicLine();
            } else {
                // In stock somewhere, but not with the current other-group picks.
                // Dim it + add a muted slash, but KEEP IT CLICKABLE — clicking
                // clears the conflicting other pick (handled in selectVariant) so
                // there is no dead-end.
                btn.disabled = false;
                btn.classList.remove('sold-out');
                btn.classList.add('variant-incompatible');
                btn.style.opacity = '';
                removeDynamicLine();
                if (isColorSwatch && !btn.querySelector('.swatch-incompat-line')) {
                    const line = document.createElement('span');
                    line.className = 'swatch-incompat-line';
                    btn.appendChild(line);
                }
            }
        });
    });
}

function validateVariants() {
    // In per-piece mode, use per-piece validation instead
    if (perPieceMode) {
        return validatePerPieceVariants();
    }

    const variantGroups = document.querySelectorAll('.variants-section .variant-group');
    if (variantGroups.length === 0) return true;

    // Clear previous error states
    variantGroups.forEach(g => g.classList.remove('error'));

    let firstMissing = null;
    let missingNames = [];

    for (const group of variantGroups) {
        if (group.dataset.groupType === 'selectable') continue; // multi-select groups are fully optional
        const groupId = group.dataset.groupId;
        if (!selectedVariants[groupId]) {
            group.classList.add('error');
            missingNames.push(group.dataset.groupName);
            if (!firstMissing) firstMissing = group;
        }
    }

    if (firstMissing) {
        // Scroll to the first missing variant group
        firstMissing.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        // Show error toast in red
        const sep = storeLang === 'fr' ? ' et ' : ' و ';
        const msg = storeLang === 'fr' ? 'Veuillez choisir: ' : 'يرجى اختيار: ';
        showToast(msg + missingNames.join(sep), 'error');
        return false;
    }

    // Combination stock safety check (options should already be disabled, this is a fallback)
    if (combinationStockEnabled && variantCombinationsData.length > 0) {
        const selectedKey = comboKeysFromSelections(selectedVariants).join('|');

        let matchedCombo = variantCombinationsData.find(combo => {
            const comboKeys = combo.options.map(o => o.group_name + '||' + o.option_name).sort();
            return comboKeys.join('|') === selectedKey;
        });
        // Cascade fallback: when the cascading-variants addon hides child groups
        // (parent_option_id set on a group), selectedVariants has fewer dimensions
        // than combos. Accept any combo whose options are a SUPERSET of the user's
        // selection AND has remaining stock. Gated on `parent_option_id` so non-
        // cascading products see byte-identical behavior (exact match always wins).
        if (!matchedCombo && productVariantsData.some(g => g.parent_option_id)) {
            matchedCombo = variantCombinationsData.find(combo => {
                if (parseInt(combo.stock) <= 0) return false;
                for (const _gid in selectedVariants) {
                    if (_gid.indexOf('::') !== -1) continue; // selectable picks never join combos
                    const _v = selectedVariants[_gid];
                    const _f = combo.options.some(o => o.group_name === _v.groupName && o.option_name === _v.optionName);
                    if (!_f) return false;
                }
                return true;
            });
        }

        if (!matchedCombo || parseInt(matchedCombo.stock) <= 0) {
            // Tell the buyer why nothing happened — this branch used to fail silently.
            const vs = document.querySelector('.variants-section');
            if (vs) vs.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            showToast(storeLang === 'fr' ? 'Cette combinaison n\'est pas disponible actuellement, veuillez choisir une autre' : 'هذه التشكيلة غير متوفرة حالياً، يرجى اختيار تشكيلة أخرى', 'error');
            return false;
        }
    }

    return true;
}

// Product Addons Functions
let addonPriceAdjustment = 0;

function handleAddonImageUpload(input, addonId) {
    const file = input.files[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showToast(storeLang === 'fr' ? 'Image trop grande (max 5MB)' : 'حجم الصورة كبير جداً (الحد الأقصى 5MB)', 'error');
        input.value = '';
        return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast(storeLang === 'fr' ? 'Type de fichier non supporté' : 'نوع الملف غير مدعوم', 'error');
        input.value = '';
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewDiv = document.getElementById('addon-preview-' + addonId);
        const uploadArea = document.getElementById('addon-upload-' + addonId);
        const dataInput = input.parentElement.querySelector('.addon-image-data');

        previewDiv.querySelector('img').src = e.target.result;
        previewDiv.style.display = 'block';
        uploadArea.style.display = 'none';

        // Store base64 data
        dataInput.value = e.target.result;

        // Update addon price
        updateAddonPrice();
    };
    reader.readAsDataURL(file);
}

function removeAddonImage(addonId) {
    const previewDiv = document.getElementById('addon-preview-' + addonId);
    const uploadArea = document.getElementById('addon-upload-' + addonId);
    const fileInput = uploadArea.previousElementSibling;
    const dataInput = fileInput.parentElement.querySelector('.addon-image-data');

    fileInput.value = '';
    dataInput.value = '';
    previewDiv.style.display = 'none';
    uploadArea.style.display = 'block';

    // Update addon price
    updateAddonPrice();
}

function updateAddonPrice() {
    addonPriceAdjustment = 0;

    document.querySelectorAll('.addon-field').forEach(field => {
        const extraPrice = parseFloat(field.dataset.extraPrice) || 0;
        if (extraPrice <= 0) return;

        const input = field.querySelector('.addon-input');
        if (!input) return;

        // Check if addon has value
        let hasValue = false;
        if (input.classList.contains('addon-file-input')) {
            const dataInput = field.querySelector('.addon-image-data');
            hasValue = dataInput && dataInput.value;
        } else {
            hasValue = input.value.trim() !== '';
        }

        if (hasValue) {
            addonPriceAdjustment += extraPrice;
        }
    });

    // Update displayed price using existing function
    updateVariantPrice();
}

function validateAddons() {
    const addonFields = document.querySelectorAll('.addon-field');
    let firstMissing = null;
    let missingNames = [];

    addonFields.forEach(field => {
        const input = field.querySelector('.addon-input');
        if (!input) return;

        const isRequired = input.hasAttribute('required');
        if (!isRequired) return;

        let hasValue = false;
        if (input.classList.contains('addon-file-input')) {
            const dataInput = field.querySelector('.addon-image-data');
            hasValue = dataInput && dataInput.value;
        } else {
            hasValue = input.value.trim() !== '';
        }

        if (!hasValue) {
            const label = field.querySelector('.addon-label');
            missingNames.push(label ? label.textContent.replace('*', '').trim() : (storeLang === 'fr' ? 'champ' : 'حقل'));
            if (!firstMissing) firstMissing = field;
        }
    });

    if (firstMissing) {
        firstMissing.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        const sep = storeLang === 'fr' ? ' et ' : ' و ';
        const msg = storeLang === 'fr' ? 'Veuillez compléter: ' : 'يرجى إكمال: ';
        showToast(msg + missingNames.join(sep), 'error');
        return false;
    }

    return true;
}

function getAddonValues() {
    const addons = [];

    document.querySelectorAll('.addon-field').forEach(field => {
        const addonId = field.dataset.addonId;
        const extraPrice = parseFloat(field.dataset.extraPrice) || 0;
        const label = field.querySelector('.addon-label');
        const title = label ? label.textContent.replace('*', '').replace(/\+[\d,]+ د\.ج/, '').trim() : '';

        const input = field.querySelector('.addon-input');
        if (!input) return;

        let value = '';
        let inputType = 'text';

        if (input.classList.contains('addon-file-input')) {
            const dataInput = field.querySelector('.addon-image-data');
            value = dataInput ? dataInput.value : '';
            inputType = 'image';
        } else if (input.tagName === 'TEXTAREA') {
            value = input.value.trim();
            inputType = 'textarea';
        } else {
            value = input.value.trim();
            inputType = 'text';
        }

        if (value) {
            addons.push({
                addon_id: addonId,
                title: title,
                input_type: inputType,
                value: value,
                extra_price: extraPrice
            });
        }
    });

    return addons;
}

// Listen for addon input changes to update price
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.addon-input:not(.addon-file-input)').forEach(input => {
        input.addEventListener('input', updateAddonPrice);
    });
});

// Add to cart
let _addToCartBusy = false;

function addToCart(clickedBtn) {
    // Debounce: prevent spam clicking
    if (_addToCartBusy) return;
    _addToCartBusy = true;
    setTimeout(function() {
        _addToCartBusy = false;
    }, 800);

    // Validate variants
    if (!validateVariants()) return;

    // Validate addons
    if (!validateAddons()) return;

    const qty = parseInt(_val(document.getElementById('quantity')) || 1);

    // Create unique cart item key including variants and addons
    const variantKey = Object.values(selectedVariants)
        .map(v => v.optionId)
        .sort()
        .join('-');

    // Get addon values
    const addons = getAddonValues();
    const addonKey = addons.map(a => a.addon_id + ':' + a.value.substring(0, 20)).join('|');
    const totalAddonPrice = addons.reduce((sum, a) => sum + (parseFloat(a.extra_price) || 0), 0);

    const offerPrice = selectedOffer ? (selectedOffer.price + getTotalVariantAdjustment() + totalAddonPrice) : (basePrice + variantPriceAdjustment + totalAddonPrice);
    const product = {
        id: PD.productIdNum,
        name: selectedOffer ? (PD.productName + ' - ' + (selectedOffer.title || '\u0639\u0631\u0636')) : PD.productName,
        price: offerPrice,
        basePrice: basePrice,
        image: PD.primaryImage,
        quantity: selectedOffer ? selectedOffer.quantity : qty,
        variants: perPieceMode ? Object.values(perPieceVariants[1] || {}) : Object.values(selectedVariants),
        per_piece_variants: perPieceMode ? getPerPieceVariantsPayload() : null,
        variantKey: variantKey,
        addons: addons,
        addonKey: addonKey,
        is_offer: !!selectedOffer,
        offer_id: selectedOffer ? selectedOffer.id : null,
        track_stock: trackStock,
        max_qty: trackStock ? maxQty : 0
    };

    // Get existing cart
    let cart = JSON.parse(_store('localStorage').getItem(cartKey) || '[]');

    // Check if product with same variants AND addons exists
    const existingIndex = cart.findIndex(item =>
        item.id === product.id && item.variantKey === variantKey && (item.addonKey || '') === addonKey
    );

    if (existingIndex > -1) {
        if (product.is_offer) {
            // Offer already in cart — don't change quantity, just notify
            showToast('هذا العرض موجود بالفعل في السلة');
            return;
        }
        // Enforce stock limit: check total qty of this product across ALL cart entries
        if (trackStock) {
            const totalProductQty = cart.reduce((sum, item) => item.id === product.id ? sum + (item.quantity || 1) : sum, 0);
            if (totalProductQty + qty > maxQty) {
                showToast(storeLang === 'fr' ? 'Stock insuffisant (max ' + maxQty + ')' : 'الكمية المتاحة ' + maxQty + ' فقط');
                const canAdd = maxQty - totalProductQty;
                if (canAdd > 0) {
                    cart[existingIndex].quantity += canAdd;
                }
                try {
                    _store('localStorage').setItem(cartKey, JSON.stringify(cart));
                } catch (e) {
                    showToast(storeLang === 'fr' ? "Impossible d'ajouter au panier. Commandez directement ici." : 'تعذرت الإضافة إلى السلة. اطلب مباشرة من هنا.', 'error');
                    return;
                }
                updateCartBadge();
                return;
            }
        }
        cart[existingIndex].quantity += qty;
    } else {
        // For new entries, still check total qty across all cart entries
        if (trackStock && !product.is_offer) {
            const totalProductQty = cart.reduce((sum, item) => item.id === product.id ? sum + (item.quantity || 1) : sum, 0);
            if (totalProductQty + qty > maxQty) {
                showToast(storeLang === 'fr' ? 'Stock insuffisant (max ' + maxQty + ')' : 'الكمية المتاحة ' + maxQty + ' فقط');
                return;
            }
        }
        cart.push(product);
    }

    // Save cart: an image addon can push the JSON past the storage quota.
    try {
        _store('localStorage').setItem(cartKey, JSON.stringify(cart));
    } catch (e) {
        showToast(storeLang === 'fr' ? "Impossible d'ajouter au panier. Commandez directement ici." : 'تعذرت الإضافة إلى السلة. اطلب مباشرة من هنا.', 'error');
        return;
    }

    // Update cart badge
    updateCartBadge();

    // with an offer selected qty is the bundle size and product.price the bundle total, so never multiply them
    const atcValue = product.is_offer ? product.price : product.price * qty;
    // Track AddToCart event on all pixels
    const cartEventData = {
        content_name: PD.productName,
        content_ids: [PD.productId],
        content_type: 'product',
        value: atcValue,
        currency: 'DZD',
        quantity: qty
    };

    // Generate the AddToCart event_id ONCE up front so the browser pixels and the
    // server-side CAPI relay below all share it (Meta/TikTok deduplicate on this id).
    var atcEventId = (typeof window.generateEventId === 'function') ? window.generateEventId('AddToCart') : ('AddToCart_' + Date.now());

    if (typeof window.trackPixelEvent === 'function') {
        // Canonical helper: all networks with their dedup ids (Snap
        // client_dedup_id, Pinterest event_id, GA value/currency) + the
        // server CAPI relay — one call, full parity with cart/checkout.
        window.trackPixelEvent('AddToCart', {
            content_name: PD.productName,
            content_ids: [PD.productId],
            content_id: PD.productId,
            content_type: 'product',
            contents: [{
                id: PD.productId,
                quantity: qty,
                item_price: atcValue / (qty || 1)
            }],
            num_items: qty,
            value: atcValue,
            currency: 'DZD',
            quantity: qty
        }, atcEventId);
        flyToCart(clickedBtn);
        showToast(storeLang === 'fr' ? 'Ajouté au panier' : 'تمت الإضافة إلى السلة');
        return;
    }

    // Fallback: direct per-network calls (helper unavailable)
    // Facebook Pixel
    if (typeof fbq !== 'undefined') {
        fbq('track', 'AddToCart', cartEventData, {
            eventID: atcEventId
        });
    }
    // TikTok Pixel (requires content_id for VSA)
    if (typeof ttq !== 'undefined') {
        ttq.track('AddToCart', {
            content_id: PD.productId,
            content_name: PD.productName,
            content_type: 'product',
            value: atcValue,
            currency: 'DZD',
            quantity: qty
        }, {
            event_id: atcEventId
        });
    }
    // Snapchat Pixel
    if (typeof snaptr !== 'undefined') {
        snaptr('track', 'ADD_CART', {
            item_ids: [PD.productId],
            price: atcValue,
            currency: 'DZD'
        });
    }
    // Pinterest Tag
    if (typeof pintrk !== 'undefined') {
        pintrk('track', 'addtocart', cartEventData);
    }
    // Google Analytics
    if (typeof gtag !== 'undefined') {
        gtag('event', 'add_to_cart', {
            items: [{
                item_id: PD.productId,
                item_name: PD.productName,
                price: atcValue / (qty || 1),
                quantity: qty
            }]
        });
    }

    // Server-side CAPI tracking for AddToCart — reuses the SAME atcEventId fired on the
    // browser pixels above so Meta/TikTok deduplicate the browser + server legs.
    if (typeof window.trackServerEvent === 'function') {
        window.trackServerEvent('AddToCart', {
            product_id: PD.productId,
            name: PD.productName,
            price: atcValue,
            content_ids: [PD.productId],
            contents: [{
                id: PD.productId,
                quantity: qty,
                item_price: atcValue / (qty || 1)
            }],
            num_items: qty
        }, atcEventId);
    }

    // Fly-to-cart animation + toast
    flyToCart(clickedBtn);
    showToast(storeLang === 'fr' ? 'Ajouté au panier' : 'تمت الإضافة إلى السلة');
}

// Fly-to-cart bag animation
function flyToCart(clickedBtn) {
    // Source: the button that was clicked, fallback to product image
    var srcEl = clickedBtn ||
        document.querySelector('.main-swiper .swiper-slide-active img') ||
        document.querySelector('.main-swiper .swiper-slide img');
    // Target: cart button in navbar (visible one)
    var cartBtn = document.querySelector('.cart-btn');
    var cartEl = null;
    if (cartBtn && cartBtn.offsetParent !== null) {
        cartEl = cartBtn;
    } else {
        // Mobile: cart icon might be in sidebar menu, use top-right corner as target
        cartEl = document.getElementById('cartCountMobile') || cartBtn;
    }
    if (!srcEl) return;

    var srcRect = srcEl.getBoundingClientRect();
    // If no visible cart element, fly to top-right corner
    var destRect = (cartEl && cartEl.offsetParent !== null) ?
        cartEl.getBoundingClientRect() :
        {
            left: window.innerWidth - 60,
            top: 10,
            width: 40,
            height: 40
        };

    // Create flying element
    var flyer = document.createElement('div');
    flyer.className = 'fly-to-cart';
    flyer.innerHTML = '<i class="bi bi-bag-fill"></i>';
    flyer.style.left = (srcRect.left + srcRect.width / 2 - 25) + 'px';
    flyer.style.top = (srcRect.top + srcRect.height / 2 - 25) + 'px';
    document.body.appendChild(flyer);

    // Force layout then animate
    flyer.offsetHeight;
    flyer.classList.add('flying');
    flyer.style.left = (destRect.left + destRect.width / 2 - 25) + 'px';
    flyer.style.top = (destRect.top + destRect.height / 2 - 25) + 'px';

    // Bounce the cart icon when flyer arrives
    setTimeout(function() {
        var cartBtn = document.querySelector('.cart-btn');
        if (cartBtn) {
            cartBtn.classList.remove('cart-bounce');
            cartBtn.offsetHeight;
            cartBtn.classList.add('cart-bounce');
        }
        // Also bounce mobile cart badge
        var mobileBadge = document.getElementById('cartCountMobile');
        if (mobileBadge) {
            mobileBadge.classList.remove('cart-bounce');
            mobileBadge.offsetHeight;
            mobileBadge.classList.add('cart-bounce');
        }
    }, 650);

    // Remove flyer after animation
    setTimeout(function() {
        if (flyer.parentNode) flyer.parentNode.removeChild(flyer);
    }, 800);
}

// Buy now — acts as fast checkout: submit if ready, scroll & validate if not
function buyNow() {
    const fc = document.getElementById('fastCheckoutSection');
    const form = document.getElementById('fastCheckoutForm');
    if (!fc || !form) {
        // Fallback if fast checkout is disabled
        if (!validateVariants()) return;
        if (!validateAddons()) return;
        addToCart();
        window.location.href = '/checkout';
        return;
    }

    // Check if all required fast checkout fields are filled
    const phone = (_valTrim(document.getElementById('fc_phone')) || '').replace(/\D/g, '');
    const name = _valTrim(document.getElementById('fc_name'));
    const wilayaId = _val(document.getElementById('fc_wilaya'));
    const commune = _valTrim(document.getElementById('fc_commune'));
    const allFilled = /^0\d{9}$|^(?:00)?213\d{9}$|^(?:00)?2130[5-7]\d{8}$/.test(phone) && name && wilayaId && commune && selectedDeliveryType;

    if (allFilled) {
        // All info filled — submit like the fast checkout button
        submitFastCheckout(new Event('submit'));
    } else {
        // Missing info — scroll to fast checkout and trigger validation to show errors
        fc.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        // Brief highlight pulse
        fc.style.transition = 'box-shadow 0.3s';
        fc.style.boxShadow = '0 0 0 4px rgba(var(--store-primary-rgb, 26,26,46), 0.25)';
        setTimeout(() => {
            fc.style.boxShadow = '';
        }, 1500);
        // Trigger validation after scroll completes to show what's missing
        setTimeout(() => {
            submitFastCheckout(new Event('submit'));
        }, 600);
    }
}

// Update cart badge in header
function updateCartBadge() {
    const cart = JSON.parse(_store('localStorage').getItem(cartKey) || '[]');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const badges = document.querySelectorAll('.cart-badge, .cart-count');
    badges.forEach(badge => {
        badge.textContent = totalItems;
        badge.style.display = totalItems > 0 ? 'flex' : 'none';
    });
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    toastMsg.textContent = message;

    // Remove previous type classes
    toast.classList.remove('success', 'error');

    // Add appropriate class
    toast.classList.add('show', type);

    setTimeout(() => {
        toast.classList.remove('show', type);
    }, 2500);
}

// Initialize cart badge on load
document.addEventListener('DOMContentLoaded', updateCartBadge);

// iOS keyboard handling: hide the mobile floating buy bar while the soft
// keyboard is open. Without this, iOS Safari/WKWebView (Facebook,
// Instagram, Messenger, TikTok in-app browsers) anchors fixed-bottom
// elements to the visual viewport, so when the keyboard opens our bar
// moves up to just above the keyboard — exactly where the native iOS
// keyboard accessory bar (^/v field-nav + Done) lives. The two stack
// and the bar looks "broken" (see 2026-05-18 screenshots).
//
// Detection: visualViewport.height shrinks by >150px when keyboard opens.
// Feature-detected — silent no-op on older browsers that lack
// window.visualViewport (Safari ≤12, very old Chrome). Toggle uses
// visibility (not display) to avoid a reflow on every keyboard event.
(function() {
    if (!window.visualViewport) return;
    var bar = document.querySelector('.fixed-bottom-bar.d-md-none');
    if (!bar) return;
    var KEYBOARD_THRESHOLD = 150;

    function onViewportChange() {
        var heightLoss = window.innerHeight - window.visualViewport.height;
        var kbOpen = heightLoss > KEYBOARD_THRESHOLD;
        bar.style.visibility = kbOpen ? 'hidden' : '';
    }
    window.visualViewport.addEventListener('resize', onViewportChange);
    window.visualViewport.addEventListener('scroll', onViewportChange);
    // Fallback: some in-app webviews fire a stale (or no) visualViewport
    // resize when the keyboard closes, leaving the bar visibility:hidden
    // forever. Once focus leaves all inputs, force the bar back.
    document.addEventListener('focusout', function() {
        setTimeout(function() {
            var ae = document.activeElement;
            if (!ae || !/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) {
                bar.style.visibility = '';
            }
        }, 250);
    });
})();

// bfcache restore (back-swipe in Safari and the Instagram/Facebook/TikTok
// in-app browsers) resurrects the page with its JS state intact: a submit
// that was in flight when the user navigated away leaves _fcSubmitting=true
// and the button disabled+loading — so every later Buy Now tap is silently
// ignored. Reset submit state on restore. Only touches the button when it
// is actually stuck in the loading state (never re-enables a button the
// server rendered disabled, e.g. out of stock).
window.addEventListener('pageshow', function(e) {
    if (!e.persisted) return;
    window._fcSubmitting = false;
    var b = document.getElementById('btnFastCheckout');
    if (b && b.classList.contains('loading')) {
        b.classList.remove('loading');
        b.disabled = false;
    }
});

if (PD.cuEnabled) {
    // ========== COUNTDOWN URGENCY ADDON ==========
    (function() {
        if (PD.cuShowCountdown) {
            // Fake countdown: resets every N hours deterministically
            const cuCycle = PD.cuCycleHours * 3600 * 1000;

            function cuUpdate() {
                const now = Date.now();
                const elapsed = now % cuCycle;
                const remaining = cuCycle - elapsed;
                const d = Math.floor(remaining / 86400000);
                const h = Math.floor((remaining % 86400000) / 3600000);
                const m = Math.floor((remaining % 3600000) / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                const el = id => document.getElementById(id);
                if (el('cu-days')) el('cu-days').textContent = String(d).padStart(2, '0');
                if (el('cu-hours')) el('cu-hours').textContent = String(h).padStart(2, '0');
                if (el('cu-mins')) el('cu-mins').textContent = String(m).padStart(2, '0');
                if (el('cu-secs')) el('cu-secs').textContent = String(s).padStart(2, '0');
            }
            cuUpdate();
            setInterval(cuUpdate, 1000);
        }

        if (PD.cuShowVisitors) {
            // Fake visitors: fluctuate ±1 every 3-5 seconds
            const cuMin = PD.cuMinVisitors;
            const cuMax = PD.cuMaxVisitors;
            const cuCountEl = document.getElementById('cu-visitor-count');
            if (cuCountEl) {
                setInterval(function() {
                    let v = parseInt(cuCountEl.textContent) || cuMin;
                    v += Math.random() > 0.5 ? 1 : -1;
                    if (v < cuMin) v = cuMin + 1;
                    if (v > cuMax) v = cuMax - 1;
                    cuCountEl.textContent = v;
                }, 3000 + Math.random() * 2000);
            }
        }
    })();
}

// ========== FAST CHECKOUT FUNCTIONS ==========
const shippingRates = PD.shippingRates;
const productPrice = PD.price;
const hasShippingRates = Object.keys(shippingRates).length > 0;
const isFreeShippingAll = PD.freeShipping;
const fcWilayaMode = PD.fcWilayaMode;
// Note: freeShippingThreshold already declared above
var selectedDeliveryType = null;
let selectedShippingPrice = 0;
let homePrice = 0;
let deskPrice = 0;
let userManuallySelectedDelivery = false; // Track if user manually clicked a delivery option

// Weight surcharge config
const fcProductWeight = PD.weight;
const fcWeightSurchargeConfig = PD.weightSurcharge;

// Weight surcharge on TOTAL weight (weight × qty), free allowance applied ONCE
// per order — mirrors server-side WeightSurcharge::calculate()
function calcFcWeightSurcharge(weightKg, quantity, wilayaId) {
    if (!weightKg || weightKg <= 0 || quantity <= 0) return 0;
    const cfg = fcWeightSurchargeConfig;
    const totalKg = weightKg * quantity;
    if (totalKg <= cfg.free_weight_kg) return 0;
    const extraKg = totalKg - cfg.free_weight_kg;
    const isDeepSouth = cfg.deep_south_wilaya_ids.includes(parseInt(wilayaId));
    const rate = isDeepSouth ? cfg.deep_south_rate_per_kg : cfg.normal_rate_per_kg;
    return Math.round(extraKg * rate * 100) / 100;
}

function fcWeightSurchargeForTotal() {
    if (!selectedShippingPrice || selectedShippingPrice <= 0) return 0;
    const wilayaId = document.getElementById('fc_wilaya') ? document.getElementById('fc_wilaya').value : '';
    if (!wilayaId) return 0;
    const fcQtyInput = document.getElementById('fc_quantity');
    const mainQtyInput = document.getElementById('quantity');
    const qty = typeof selectedOffer !== 'undefined' && selectedOffer ? (selectedOffer.quantity || 1) : parseInt((fcQtyInput && fcQtyInput.value) || (mainQtyInput && mainQtyInput.value) || 1);
    return calcFcWeightSurcharge(fcProductWeight, qty, wilayaId);
}

// Promo code state for fast checkout
let fcAppliedPromoCode = null;
let fcAppliedDiscount = 0;
let fcAppliedPromoId = null;

// Default shipping prices if store hasn't configured any
const defaultHomePrice = 600;
const defaultDeskPrice = 400;

// Pre-loaded communes data — emitted as an inert <script type="application/json"> island
// (#fc-communes-data) and JSON.parsed lazily on first wilaya-select, so the ~133KB no longer
// pays a synchronous JS object-literal parse/compile on every page load. Data is IDENTICAL
// (has_home/has_desk caps already merged server-side) and stays instant/no-network — zero
// order-path change.
let allCommunesData = null;

function _fcCommunes() {
    if (allCommunesData === null) {
        var _el = document.getElementById('fc-communes-data');
        try {
            allCommunesData = _el ? (JSON.parse(_el.textContent || '{}') || {}) : {};
        } catch (e) {
            allCommunesData = {};
        }
    }
    return allCommunesData;
}
const communeNameField = PD.communeNameField;

// Load communes for fast checkout (uses pre-loaded data - instant!)
function loadFcCommunes(wilayaId) {
    const communeElement = document.getElementById('fc_commune');

    // Only load if in 58 mode and element is a select
    if (fcWilayaMode !== '58' || !communeElement || communeElement.tagName !== 'SELECT') {
        return;
    }

    const defaultText = storeLang === 'fr' ? 'Commune *' : 'البلدية *';
    const selectWilayaText = storeLang === 'fr' ? '-- Choisir la wilaya d\'abord --' : '-- اختر الولاية أولاً --';

    if (!wilayaId) {
        communeElement.innerHTML = `<option value="">${selectWilayaText}</option>`;
        communeElement.disabled = true;
        communeElement.style.opacity = '0.6';
        communeElement.style.cursor = 'not-allowed';
        communeElement.style.backgroundColor = '#f0f0f0';
        communeElement.classList.add('fc-commune-locked');
        return;
    }

    // Use pre-loaded data (instant - no network request!); lazy-parsed from the JSON island on first use.
    const communes = _fcCommunes()[wilayaId] || [];

    // Reset commune-level capability flags
    window._fcCommuneHome = 1;
    window._fcCommuneDesk = 1;

    if (communes.length > 0) {
        let html = `<option value="">${defaultText}</option>`;
        communes.forEach(commune => {
            const displayName = commune[communeNameField] || commune.name_ar;
            const hasHome = commune.has_home != null ? commune.has_home : 1;
            const hasDesk = commune.has_desk != null ? commune.has_desk : 1;
            const deskHere = commune.desk_here != null ? commune.desk_here : hasDesk;
            let icons = '';
            if (commune.has_home !== undefined || commune.has_desk !== undefined) {
                if (hasHome) icons += ' \u{1F3E0}';
                if (deskHere) icons += ' \u{1F3E2}';
            }
            html += `<option value="${commune.name_ar}" data-has-home="${hasHome}" data-has-desk="${hasDesk}">${displayName}${icons}</option>`;
        });
        communeElement.innerHTML = html;
        communeElement.disabled = false;
        communeElement.style.opacity = '1';
        communeElement.style.cursor = 'pointer';
        communeElement.style.backgroundColor = '';
        communeElement.classList.remove('fc-commune-locked');
    } else {
        communeElement.innerHTML = `<option value="">${defaultText}</option>`;
        communeElement.disabled = false;
        communeElement.style.opacity = '1';
        communeElement.style.cursor = 'pointer';
        communeElement.style.backgroundColor = '';
        communeElement.classList.remove('fc-commune-locked');
    }
}

// Commune-level delivery capability flags (set by commune change)
if (typeof window._fcCommuneHome === 'undefined') window._fcCommuneHome = 1;
if (typeof window._fcCommuneDesk === 'undefined') window._fcCommuneDesk = 1;

function updateDeliveryOptions() {
    const wilayaEl = document.getElementById('fc_wilaya');
    const labelHome = document.getElementById('labelHome');
    const labelDesk = document.getElementById('labelDesk');
    const radioHome = document.getElementById('radioHome');
    const radioDesk = document.getElementById('radioDesk');
    const priceHome = document.getElementById('priceHome');
    const priceDesk = document.getElementById('priceDesk');
    // Fast-checkout markup absent (show_fast_checkout off / out of stock) — nothing to update.
    if (!wilayaEl || !labelHome || !labelDesk || !radioHome || !radioDesk || !priceHome || !priceDesk) {
        updateTotal();
        return;
    }
    const wilayaId = wilayaEl.value;
    const cHome = window._fcCommuneHome;
    const cDesk = window._fcCommuneDesk;

    // Save previous selection BEFORE reset
    const previousSelection = selectedDeliveryType;
    const wasManuallySelected = userManuallySelectedDelivery;

    // Reset
    labelHome.classList.add('disabled');
    labelDesk.classList.add('disabled');
    radioHome.disabled = true;
    radioDesk.disabled = true;
    radioHome.checked = false;
    radioDesk.checked = false;
    priceHome.textContent = '--';
    priceDesk.textContent = '--';
    selectedDeliveryType = null;
    selectedShippingPrice = 0;
    homePrice = 0;
    deskPrice = 0;

    if (!wilayaId) {
        updateTotal();
        return;
    }

    // Calculate total including current quantity and variant adjustments
    const fcQtyInput = document.getElementById('fc_quantity');
    const mainQtyInput = document.getElementById('quantity');
    const quantity = parseInt(_val(fcQtyInput) || _val(mainQtyInput) || 1);

    // Calculate order total - use offer price if selected (offer price is total, not per unit)
    let orderTotal;
    if (selectedOffer) {
        orderTotal = selectedOffer.price + getTotalVariantAdjustment();
    } else {
        const currentPrice = (typeof basePrice !== 'undefined' ? basePrice : productPrice) +
            (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0);
        orderTotal = currentPrice * quantity;
    }

    // Check if free shipping applies (all orders, threshold met, or offer-level flag)
    const isFreeShipping = isFreeShippingAll || (freeShippingThreshold > 0 && orderTotal >= freeShippingThreshold) || (selectedOffer && selectedOffer.freeShipping === 1);

    // Check if store has shipping rates configured
    // Try both string and number key since PHP might serialize differently
    const rate = shippingRates[wilayaId] || shippingRates[String(wilayaId)] || shippingRates[parseInt(wilayaId)];

    // Determine which delivery options are enabled
    // If rate exists for this wilaya, use its enabled flags
    // If no rates configured at all, enable both by default
    // If rates exist but not for this wilaya, both stay disabled (handled by initial reset)
    let homeEnabled = false;
    let deskEnabled = false;

    if (rate) {
        homeEnabled = rate.home_delivery_enabled == 1 || rate.home_delivery_enabled === '1';
        deskEnabled = rate.desk_delivery_enabled == 1 || rate.desk_delivery_enabled === '1';
    } else if (!hasShippingRates) {
        // No shipping rates configured at all - enable both by default
        homeEnabled = true;
        deskEnabled = true;
    }
    // Apply commune-level capability filter (must have both wilaya AND commune enabled)
    if (cHome != 1) homeEnabled = false;
    if (cDesk != 1) deskEnabled = false;

    // If free shipping is enabled
    if (isFreeShipping) {
        homePrice = 0;
        deskPrice = 0;
        const freeText = storeLang === 'fr' ? 'Gratuit' : 'مجاني';

        // Only enable options that are allowed by the rate configuration
        if (homeEnabled) {
            priceHome.textContent = freeText;
            labelHome.classList.remove('disabled');
            radioHome.disabled = false;
        }

        if (deskEnabled) {
            priceDesk.textContent = freeText;
            labelDesk.classList.remove('disabled');
            radioDesk.disabled = false;
        }

        // Auto-select an available delivery option via selectDelivery() so that
        // addressWrapper visibility is always updated correctly.
        if (wasManuallySelected && previousSelection === 'desk' && deskEnabled) {
            selectDelivery('desk');
            userManuallySelectedDelivery = true;
        } else if (wasManuallySelected && previousSelection === 'home' && homeEnabled) {
            selectDelivery('home');
            userManuallySelectedDelivery = true;
        } else if (homeEnabled) {
            selectDelivery('home');
        } else if (deskEnabled) {
            selectDelivery('desk');
        }
        // selectDelivery() already calls updateTotal()
        return;
    }

    // Normal shipping (not free)
    // Calculate weight surcharge for display
    const fcQty = selectedOffer ? (selectedOffer.quantity || 1) : quantity;
    const fcWeightExtra = calcFcWeightSurcharge(fcProductWeight, fcQty, wilayaId);

    if (rate) {
        // Store has shipping rates for this wilaya
        const addonFreeText = storeLang === 'fr' ? 'Gratuit' : 'مجاني';
        if (homeEnabled) {
            homePrice = Number(rate.home_delivery_price) || 0;
            if (homePrice === 0) {
                priceHome.textContent = addonFreeText;
                priceHome.style.color = '#22c55e';
                priceHome.style.fontWeight = '700';
            } else {
                priceHome.textContent = String(Math.round(((homePrice + fcWeightExtra)) * 100) / 100) + ' ' + currencySymbol;
                priceHome.style.color = '';
                priceHome.style.fontWeight = '';
            }
            labelHome.classList.remove('disabled');
            radioHome.disabled = false;
        }

        if (deskEnabled) {
            deskPrice = Number(rate.desk_delivery_price) || 0;
            if (deskPrice === 0) {
                priceDesk.textContent = addonFreeText;
                priceDesk.style.color = '#22c55e';
                priceDesk.style.fontWeight = '700';
            } else {
                priceDesk.textContent = String(Math.round(((deskPrice + fcWeightExtra)) * 100) / 100) + ' ' + currencySymbol;
                priceDesk.style.color = '';
                priceDesk.style.fontWeight = '';
            }
            labelDesk.classList.remove('disabled');
            radioDesk.disabled = false;
        }
    } else if (!hasShippingRates) {
        // No shipping rates configured at all - use defaults for all wilayas
        homePrice = defaultHomePrice;
        deskPrice = defaultDeskPrice;
        priceHome.textContent = String(Math.round(((homePrice + fcWeightExtra)) * 100) / 100) + ' ' + currencySymbol;
        priceDesk.textContent = String(Math.round(((deskPrice + fcWeightExtra)) * 100) / 100) + ' ' + currencySymbol;
        labelHome.classList.remove('disabled');
        labelDesk.classList.remove('disabled');
        radioHome.disabled = false;
        radioDesk.disabled = false;
    }
    // If store has shipping rates but none for this wilaya, keep radios disabled

    // Auto-select delivery option (respect user's manual selection if available)
    if (wasManuallySelected && previousSelection) {
        // User manually selected, try to keep their choice if still available
        if (previousSelection === 'home' && !radioHome.disabled) {
            selectDelivery('home');
            userManuallySelectedDelivery = true; // Restore flag
        } else if (previousSelection === 'desk' && !radioDesk.disabled) {
            selectDelivery('desk');
            userManuallySelectedDelivery = true; // Restore flag
        } else {
            // Previous selection not available, auto-select
            userManuallySelectedDelivery = false;
            autoSelectDelivery();
        }
    } else {
        // No manual selection, auto-select cheaper option
        autoSelectDelivery();
    }

    function autoSelectDelivery() {
        // Always prefer home delivery by default; customer can change manually
        if (!radioHome.disabled) {
            selectDelivery('home');
        } else if (!radioDesk.disabled) {
            selectDelivery('desk');
        }
    }

    updateTotal();
}

function selectDelivery(type, isManual = false) {
    const radioHome = document.getElementById('radioHome');
    const radioDesk = document.getElementById('radioDesk');
    const addressWrapper = document.getElementById('fc_address_wrapper');

    if (type === 'home' && !radioHome.disabled) {
        radioHome.checked = true;
        selectedDeliveryType = 'home';
        selectedShippingPrice = homePrice;
        if (isManual) userManuallySelectedDelivery = true;
        // Show address field for home delivery
        if (addressWrapper) addressWrapper.style.display = '';
    } else if (type === 'desk' && !radioDesk.disabled) {
        radioDesk.checked = true;
        selectedDeliveryType = 'desk';
        selectedShippingPrice = deskPrice;
        if (isManual) userManuallySelectedDelivery = true;
        // Hide address field for desk delivery
        if (addressWrapper) addressWrapper.style.display = 'none';
    }

    updateTotal();
    // Update field guide animation after delivery selection
    if (typeof window.updateFcGuide === 'function') window.updateFcGuide();
}

function updateTotal() {
    // Get quantity from either selector (prefer fc_quantity as it's in the checkout)
    const fcQtyInput = document.getElementById('fc_quantity');
    const mainQtyInput = document.getElementById('quantity');
    let qty = parseInt(_val(fcQtyInput) || _val(mainQtyInput) || 1);

    // Calculate addon price
    const addonPrice = typeof addonPriceAdjustment !== 'undefined' ? addonPriceAdjustment : 0;

    // If offer is selected, use offer price and quantity
    let subtotal;
    if (selectedOffer) {
        // Offer price + variant adjustment + addon price
        const varAdj = getTotalVariantAdjustment();
        subtotal = selectedOffer.price + varAdj + addonPrice;
        qty = selectedOffer.quantity; // Override qty with offer quantity
    } else {
        const adjustedPrice = basePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0) + addonPrice;
        subtotal = adjustedPrice * qty;
    }

    // The selected offer card shows the bundle price for the picked variants; the others keep their base label
    document.querySelectorAll('.offer-card').forEach(card => {
        const label = card.querySelector('.offer-price');
        if (!label) return;
        const base = parseFloat(card.dataset.offerPrice) || 0;
        const shown = selectedOffer && card.dataset.offerId === selectedOffer.id ? base + getTotalVariantAdjustment() : base;
        label.textContent = 'DA ' + String(Math.round(shown * 100) / 100);
    });

    const total = subtotal + selectedShippingPrice + fcWeightSurchargeForTotal();

    // Update total display with دج currency
    const fcTotalValue = document.getElementById('fcTotalValue');
    const fcTotalOriginal = document.getElementById('fcTotalOriginal');

    // #fcTotalValue only exists when the fast-checkout block renders; without this
    // guard the whole function threw on fast-checkout-off stores, aborting selectVariant()
    // mid-way (no price update, no availability refresh, no qty cap).
    if (!fcTotalValue) {
        if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
        return;
    }

    fcTotalValue.textContent = String(Math.round((total) * 100) / 100) + ' دج';

    // Show crossed-out original price if there's a promotion
    const comparePrice = PD.comparePrice;
    let originalTotal = 0;

    if (selectedOffer && selectedOffer.comparePrice > 0 && selectedOffer.comparePrice > selectedOffer.price) {
        // Offer has its own compare price
        originalTotal = selectedOffer.comparePrice + selectedShippingPrice + fcWeightSurchargeForTotal() + addonPrice;
    } else if (!selectedOffer && comparePrice > 0 && comparePrice > basePrice) {
        // Product-level compare price (no offer selected)
        originalTotal = (comparePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0) + addonPrice) * qty + selectedShippingPrice + fcWeightSurchargeForTotal();
    }

    if (originalTotal > 0 && originalTotal > total) {
        if (!fcTotalOriginal) {
            const span = document.createElement('span');
            span.className = 'fc-total-original';
            span.id = 'fcTotalOriginal';
            span.textContent = String(Math.round((originalTotal) * 100) / 100) + ' دج';
            fcTotalValue.parentNode.insertBefore(span, fcTotalValue);
        } else {
            fcTotalOriginal.textContent = String(Math.round((originalTotal) * 100) / 100) + ' دج';
            fcTotalOriginal.style.display = '';
        }
    } else if (fcTotalOriginal) {
        fcTotalOriginal.style.display = 'none';
    }

    // Also update free shipping progress when total changes
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
}

// Update total when quantity changes via input
var _qtyEl = document.getElementById('quantity');
if (_qtyEl) _qtyEl.addEventListener('input', function() {
    // Sync with fast checkout quantity
    const fcInput = document.getElementById('fc_quantity');
    if (fcInput) fcInput.value = this.value;

    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
});

// Update when fast checkout quantity changes
var _fcQtyEl = document.getElementById('fc_quantity');
if (_fcQtyEl) _fcQtyEl.addEventListener('input', function() {
    // Sync with main quantity
    const mainInput = document.getElementById('quantity');
    if (mainInput) mainInput.value = this.value;

    if (typeof updateTotal === 'function') updateTotal();
    if (typeof updateFreeShippingProgress === 'function') updateFreeShippingProgress();
    if (typeof updateDeliveryOptions === 'function') updateDeliveryOptions();
});

// Field validation helper functions
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + '_error');

    if (field) {
        field.classList.add('fc-error');
        // Scroll to field with offset
        const wrapper = document.getElementById(fieldId + '_wrapper') || field.parentElement;
        wrapper.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        field.focus();
    }

    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }
}

// Show error without scrolling (for multiple field validation)
function showFieldErrorOnly(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + '_error');

    if (field) {
        field.classList.add('fc-error');
    }

    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }
}

function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + '_error');

    if (field) {
        field.classList.remove('fc-error');
    }

    if (errorEl) {
        errorEl.classList.remove('show');
    }
}

// Scroll to field and add shake animation
function scrollToFieldAndShake(fieldId) {
    const wrapper = document.getElementById(fieldId + '_wrapper') || document.getElementById(fieldId);
    const field = document.getElementById(fieldId);

    if (wrapper) {
        // Scroll first without focus (to avoid keyboard opening)
        wrapper.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    if (field) {
        // Add shake animation after scroll completes
        setTimeout(() => {
            field.style.animation = 'shake 0.5s ease';
            setTimeout(() => {
                field.style.animation = '';
            }, 500);
        }, 300);
    }
}

function clearAllFieldErrors() {
    ['fc_phone', 'fc_name', 'fc_wilaya', 'fc_commune'].forEach(id => {
        clearFieldError(id);
    });
    // Also clear delivery section error
    const deliverySection = document.getElementById('deliveryOptions');
    if (deliverySection) {
        deliverySection.classList.remove('fc-error-section');
    }
}

// Check if wilaya is selected before allowing commune selection
function checkWilayaBeforeCommune() {
    const wilayaId = document.getElementById('fc_wilaya').value;
    if (!wilayaId) {
        // Show error on wilaya field
        const errMsg = storeLang === 'fr' ? 'Veuillez choisir la wilaya' : 'الرجاء اختيار الولاية أولاً';
        showFieldError('fc_wilaya', errMsg);
        showToast(errMsg, 'error');
        return false;
    }
    return true;
}

// ============================================
// Abandoned Cart Capture for Retargeting
// ============================================
// Captures on phone-only (10 digits), then updates progressively
// when name/wilaya/commune are added. Server uses UPSERT (COALESCE)
// so partial updates never overwrite existing data.
var abandonedCartCaptured = false;
var abandonedCartTimeout = null;
var lastCaptureTime = 0;
var lastCapturedHash = ''; // tracks phone+name+wilaya+commune to detect changes
var storeIdForCapture = PD.storeId;
var CAPTURE_COOLDOWN = 30000; // 30 seconds between captures

// Check if already captured in this session
var capturedKey = 'ac_captured_' + storeIdForCapture;
(function() {
    var capturedData = _store('sessionStorage').getItem(capturedKey);
    if (capturedData) {
        try {
            var data = JSON.parse(capturedData);
            abandonedCartCaptured = true;
            lastCapturedHash = data.hash || '';
            lastCaptureTime = data.time || 0;
        } catch (e) {
            abandonedCartCaptured = true;
        }
    }
})();

// Build a simple hash of current form data to detect changes
function getAcDataHash() {
    var phone = _valTrim(document.getElementById('fc_phone')) || '';
    var phoneDigits = phone.replace(/\D/g, '');
    var name = _valTrim(document.getElementById('fc_name')) || '';
    var wilayaId = _val(document.getElementById('fc_wilaya')) || '';
    var commune = _valTrim(document.getElementById('fc_commune')) || '';
    return phoneDigits + '|' + name + '|' + wilayaId + '|' + commune;
}

function captureAbandonedCart() {
    // Cooldown check - don't capture more than once per 30 seconds
    var now = Date.now();
    if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
        return;
    }

    var phone = _valTrim(document.getElementById('fc_phone'));
    if (!phone) return;

    // Validate phone format (at least 10 digits)
    var phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) return;

    // Skip if data hasn't changed since last capture
    var currentHash = getAcDataHash();
    if (currentHash === lastCapturedHash) return;

    // Get other form data (may be empty — server handles partial data via COALESCE)
    var name = _valTrim(document.getElementById('fc_name')) || '';
    var wilayaSelect = document.getElementById('fc_wilaya');
    var wilayaId = _val(wilayaSelect) || '';
    var wilayaName = (wilayaSelect && wilayaSelect.selectedIndex > 0) ? wilayaSelect.options[wilayaSelect.selectedIndex].text : '';
    var commune = _valTrim(document.getElementById('fc_commune')) || '';

    // Get quantity
    var fcQtyInput = document.getElementById('fc_quantity');
    var mainQtyInput = document.getElementById('quantity');
    var qty = parseInt(_val(fcQtyInput) || _val(mainQtyInput) || 1);

    // Get price with variants
    var adjustedPrice = basePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0);
    var itemPrice = selectedOffer ? selectedOffer.price : adjustedPrice;
    var itemQty = selectedOffer ? selectedOffer.quantity : qty;
    var subtotal = selectedOffer ? selectedOffer.price : (adjustedPrice * qty);

    // Get device fingerprint for abandoned cart
    var acDeviceFingerprint = null;
    if (typeof DZTrack !== 'undefined' && DZTrack.getFingerprintSync) {
        acDeviceFingerprint = DZTrack.getFingerprintSync();
    }
    if (!acDeviceFingerprint) {
        try {
            acDeviceFingerprint = sessionStorage.getItem('dz_fingerprint');
        } catch (e) {}
    }
    if (!acDeviceFingerprint) {
        // try/caught like the submit-path copy: canvas/btoa can throw and must never break capture.
        try {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('DZ', 0, 0);
            var canvasData = canvas.toDataURL().slice(-50);
            acDeviceFingerprint = btoa(navigator.userAgent + screen.width + 'x' + screen.height + navigator.language + canvasData).substring(0, 64);
        } catch (e) {
            acDeviceFingerprint = 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        }
    }

    // Build offer metadata for abandoned cart tracking
    var offerMeta = selectedOffer ? {
        is_offer: true,
        offer_id: selectedOffer.id,
        offer_title: (function() {
            var el = document.querySelector('.offer-card.selected .offer-title');
            return el ? el.textContent.trim() : '';
        })(),
        compare_price: selectedOffer.comparePrice || null
    } : {};

    var cartData = {
        store_id: storeIdForCapture,
        phone: phone,
        full_name: name,
        wilaya_id: wilayaId,
        wilaya_name: wilayaName.replace(/^\d+\s*-\s*/, ''),
        commune: commune,
        device_fingerprint: acDeviceFingerprint,
        source_page: 'product',
        cart_items: [Object.assign({
            product_id: PD.productIdNum,
            name: PD.productName,
            price: itemPrice,
            quantity: itemQty,
            image: PD.primaryImage,
            variants: typeof selectedVariants !== 'undefined' ? Object.values(selectedVariants) : []
        }, offerMeta)],
        cart_total: subtotal
    };

    // Use XMLHttpRequest for wider compatibility (no async needed)
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/abandoned-cart/capture', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
            abandonedCartCaptured = true;
            lastCapturedHash = currentHash;
            lastCaptureTime = Date.now();
            _store('sessionStorage').setItem(capturedKey, JSON.stringify({
                hash: currentHash,
                time: lastCaptureTime
            }));
        }
    };
    xhr.send(JSON.stringify(cartData));
}

// ---- Progressive capture triggers ----

// 1) Capture as soon as phone reaches 10 digits (instant, on input)
var _acPhoneEl = document.getElementById('fc_phone');
if (_acPhoneEl) {
    _acPhoneEl.addEventListener('input', function() {
        var digits = (this.value || '').replace(/\D/g, '');
        if (digits.length >= 10) {
            clearTimeout(abandonedCartTimeout);
            abandonedCartTimeout = setTimeout(captureAbandonedCart, 800);
        }
    });
}

// 2) Update when name is filled (blur event — fire after user finishes typing name)
var _acNameEl = document.getElementById('fc_name');
if (_acNameEl) {
    _acNameEl.addEventListener('blur', function() {
        var nameVal = (this.value || '').trim();
        if (nameVal.length >= 2) {
            clearTimeout(abandonedCartTimeout);
            abandonedCartTimeout = setTimeout(captureAbandonedCart, 1000);
        }
    });
}

// 3) Update when wilaya or commune changes
var _acWilayaEl = document.getElementById('fc_wilaya');
if (_acWilayaEl) {
    _acWilayaEl.addEventListener('change', function() {
        clearTimeout(abandonedCartTimeout);
        abandonedCartTimeout = setTimeout(captureAbandonedCart, 1500);
    });
}
var _acCommuneEl = document.getElementById('fc_commune');
if (_acCommuneEl) {
    _acCommuneEl.addEventListener('change', function() {
        clearTimeout(abandonedCartTimeout);
        abandonedCartTimeout = setTimeout(captureAbandonedCart, 1500);
    });
}

// 4) Capture when user closes page (final safety net via beacon)
window.addEventListener('pagehide', function() { // pagehide (not beforeunload): fires reliably on mobile teardown AND keeps bfcache eligible
    var phone = _valTrim(document.getElementById('fc_phone'));
    if (!phone) return;

    var phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) return;

    // Skip if data hasn't changed since last capture
    var currentHash = getAcDataHash();
    if (currentHash === lastCapturedHash) return;

    var fcQtyInput = document.getElementById('fc_quantity');
    var mainQtyInput = document.getElementById('quantity');
    var qty = parseInt(_val(fcQtyInput) || _val(mainQtyInput) || 1);
    var adjustedPrice = basePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0);

    // Build offer metadata for beacon capture
    var beaconOfferMeta = selectedOffer ? {
        is_offer: true,
        offer_id: selectedOffer.id,
        offer_title: (function() {
            var el = document.querySelector('.offer-card.selected .offer-title');
            return el ? el.textContent.trim() : '';
        })(),
        compare_price: selectedOffer.comparePrice || null
    } : {};

    var cartData = {
        store_id: storeIdForCapture,
        phone: phone,
        full_name: _valTrim(document.getElementById('fc_name')) || '',
        wilaya_id: _val(document.getElementById('fc_wilaya')) || '',
        source_page: 'product',
        cart_items: [Object.assign({
            product_id: PD.productIdNum,
            name: PD.productName,
            price: selectedOffer ? selectedOffer.price : adjustedPrice,
            quantity: selectedOffer ? selectedOffer.quantity : qty,
            image: PD.primaryImage
        }, beaconOfferMeta)],
        cart_total: selectedOffer ? selectedOffer.price : (adjustedPrice * qty)
    };

    navigator.sendBeacon('/api/abandoned-cart/capture', JSON.stringify(cartData));
});

async function submitFastCheckout(event) {
    event.preventDefault();

    // Re-entry guard: if a previous submit is still in flight, ignore.
    // Defends against double-tap on mobile, rapid Enter-key presses,
    // and the brief window before btn.disabled=true takes effect.
    // Self-healing: a flag older than the last fetch timeout plus 5s (45s
    // without an image addon) means it got stuck (unexpected throw, webview
    // kill mid-submit); never dead-lock the buy button for the session.
    if (window._fcSubmitting && (Date.now() - (window._fcSubmittingAt || 0)) < (window._fcSubmitWindowMs || 45000)) return;

    // Offline pre-check: skip the 25s+ timeout wait for users who already
    // know their connection is down. navigator.onLine === false is only
    // set when the browser is certain there's no network, so this never
    // false-blocks a legitimate online submit.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showToast(storeLang === 'fr' ?
            'Vous êtes hors ligne. Vérifiez votre connexion.' :
            'أنت غير متصل بالإنترنت. تحقق من اتصالك.', 'error');
        return;
    }

    // Clear all previous errors
    clearAllFieldErrors();

    // Get form values
    const name = document.getElementById('fc_name').value.trim();
    const phone = document.getElementById('fc_phone').value.trim();
    const wilayaId = document.getElementById('fc_wilaya').value;
    const commune = document.getElementById('fc_commune').value.trim();
    const addressField = document.getElementById('fc_address');
    const address = addressField ? addressField.value.trim() : '';

    // Validate each field and scroll to first error
    if (!phone) {
        showFieldErrorOnly('fc_phone', storeLang === 'fr' ? 'Veuillez entrer le numéro de téléphone' : 'الرجاء إدخال رقم الهاتف');
        scrollToFieldAndShake('fc_phone');
        return;
    }

    // The shapes Security::sanitizePhone accepts on the server; Algerian mobiles are stored as 0XXXXXXXXX
    const phoneDigits = phone.replace(/\D/g, '');
    if (!/^0\d{9}$|^(?:00)?213\d{9}$|^(?:00)?2130[5-7]\d{8}$/.test(phoneDigits)) {
        showFieldErrorOnly('fc_phone', storeLang === 'fr' ? 'Numéro de téléphone invalide' : 'رقم الهاتف غير صالح');
        scrollToFieldAndShake('fc_phone');
        return;
    }

    if (!name) {
        showFieldErrorOnly('fc_name', storeLang === 'fr' ? 'Veuillez entrer votre nom' : 'الرجاء إدخال الاسم');
        scrollToFieldAndShake('fc_name');
        return;
    }

    if (!wilayaId) {
        showFieldErrorOnly('fc_wilaya', storeLang === 'fr' ? 'Veuillez choisir la wilaya' : 'الرجاء اختيار الولاية');
        scrollToFieldAndShake('fc_wilaya');
        return;
    }

    if (!commune) {
        showFieldErrorOnly('fc_commune', storeLang === 'fr' ? 'Veuillez entrer la commune' : 'الرجاء إدخال البلدية');
        scrollToFieldAndShake('fc_commune');
        return;
    }

    if (!selectedDeliveryType) {
        // Highlight delivery section with red
        const deliverySection = document.getElementById('deliveryOptions');
        if (deliverySection) {
            deliverySection.classList.add('fc-error-section');
            deliverySection.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            // Add shake animation
            deliverySection.style.animation = 'shake 0.5s ease';
            setTimeout(() => deliverySection.style.animation = '', 500);
        }
        return;
    }

    // Validate variants
    if (!validateVariants()) return;

    // Validate addons (if any)
    if (!validateAddons()) return;

    const btn = document.getElementById('btnFastCheckout');
    window._fcSubmitting = true;
    window._fcSubmittingAt = Date.now();
    window._fcSubmitWindowMs = 45000;
    btn.disabled = true;
    btn.classList.add('loading');

    // Get quantity from fast checkout selector (or main if not available)
    const fcQtyInput = document.getElementById('fc_quantity');
    const mainQtyInput = document.getElementById('quantity');
    const qty = parseInt(_val(fcQtyInput) || _val(mainQtyInput) || 1);
    const wilayaSelect = document.getElementById('fc_wilaya');
    // Guard selectedIndex === -1 (seen with in-app browser autofill):
    // options[-1] is undefined and .text would throw AFTER the submit
    // flag is set — permanently dead-locking the button.
    const wilayaOpt = wilayaSelect.options[wilayaSelect.selectedIndex];
    const wilayaName = wilayaOpt ? wilayaOpt.text : '';

    // Get addon values and calculate total addon price
    const addons = getAddonValues();
    const totalAddonPrice = addons.reduce((sum, a) => sum + (parseFloat(a.extra_price) || 0), 0);

    const adjustedPrice = basePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0) + totalAddonPrice;

    // Calculate subtotal - use offer price if selected (offer price is total, not per unit)
    // For offers, addon price is added on top
    const itemPrice = selectedOffer ? (selectedOffer.price + totalAddonPrice) : adjustedPrice;
    const itemQty = selectedOffer ? selectedOffer.quantity : qty;
    const subtotal = selectedOffer ? (selectedOffer.price + totalAddonPrice) : (adjustedPrice * qty);

    // Get device fingerprint if available (try multiple methods with fallback)
    let deviceFingerprint = null;

    // Method 1: Try sync access from DZTrack/MinacefTracker (fastest)
    if (typeof DZTrack !== 'undefined' && DZTrack.getFingerprintSync) {
        deviceFingerprint = DZTrack.getFingerprintSync();
    } else if (typeof MinacefTracker !== 'undefined' && MinacefTracker.getFingerprintSync) {
        deviceFingerprint = MinacefTracker.getFingerprintSync();
    }

    // Method 2: Try sessionStorage directly
    if (!deviceFingerprint) {
        try {
            deviceFingerprint = _store('sessionStorage').getItem('dz_fingerprint');
        } catch (e) {}
    }

    // Method 3: Generate basic fingerprint as fallback.
    // Whole block try/caught: getContext('2d') can return null in
    // privacy/low-memory webviews, toDataURL can throw SecurityError,
    // and btoa throws on non-Latin1 user agents. Any of those would
    // otherwise throw after the submit flag is set and dead-lock the
    // button. A fingerprint is best-effort — never let it block orders.
    if (!deviceFingerprint) {
        try {
            // Create a more unique fallback fingerprint
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('DZ', 0, 0);
            const canvasData = canvas.toDataURL().slice(-50);
            deviceFingerprint = btoa(navigator.userAgent + screen.width + 'x' + screen.height + navigator.language + canvasData).substring(0, 64);
        } catch (e) {
            deviceFingerprint = 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        }
    }

    const orderData = {
        customer_name: name,
        customer_phone: phone,
        wilaya_id: wilayaId,
        wilaya_name: wilayaName,
        commune: commune,
        address: address,
        delivery_type: selectedDeliveryType,
        desk_id: document.getElementById('fc_desk_id') ? document.getElementById('fc_desk_id').value : '',
        desk_name: document.getElementById('fc_desk_name') ? document.getElementById('fc_desk_name').value : '',
        desk_provider: (document.getElementById('fc_desk_select') && document.getElementById('fc_desk_select').value) ? (document.getElementById('fc_desk_select').selectedOptions[0].dataset.provider || '') : '',
        pickup_point_id: document.getElementById('fc_pickup_id') ? document.getElementById('fc_pickup_id').value : '',
        notes: _val(document.getElementById('fc_notes')) || '',
        offer_id: selectedOffer ? selectedOffer.id : null,
        // Bot protection fields
        // hp_field intentionally always sent empty: in-app browser autofill
        // (Samsung Pass, Chrome smart-lock) fills name="website" with the
        // page URL on hidden inputs, falsely triggering bot rejection at
        // StoreController:4575. Bots are still blocked by form_time + rate
        // limit + captcha addon. Same pattern as landing-page.php.
        hp_field: '',
        form_time: Date.now() - fcPageLoadTime,
        device_fingerprint: deviceFingerprint,
        altcha_response: _captcha_value(),
        captcha_page_token: (document.getElementById('fc_captcha_page_token') || {}).value || '',
        items: [{
            product_id: PD.productIdNum,
            name: PD.productName,
            price: itemPrice,
            quantity: itemQty,
            image: PD.primaryImage,
            variants: perPieceMode ? Object.values(perPieceVariants[1] || {}) : Object.values(selectedVariants),
            per_piece_variants: perPieceMode ? getPerPieceVariantsPayload() : null,
            addons: addons
        }],
        subtotal: subtotal,
        shipping: selectedShippingPrice + fcWeightSurchargeForTotal(),
        total: Math.max(0, subtotal + selectedShippingPrice + fcWeightSurchargeForTotal() - (typeof fcAppliedDiscount !== 'undefined' ? fcAppliedDiscount : 0)),
        discount: (typeof fcAppliedDiscount !== 'undefined' ? fcAppliedDiscount : 0),
        promo_code: (typeof fcAppliedPromoCode !== 'undefined' && fcAppliedPromoCode) ? fcAppliedPromoCode : ''
    };

    // InitiateCheckout: fast-checkout buyers never visit /checkout, so this is
    // the only IC signal for the dominant single-step flow. Canonical helper =
    // every network with its dedup id + the server-side CAPI relay. The
    // advanced-matching stash also carries the typed identity to the
    // order-success Purchase (hashed by the pixel SDK, never in HTML).
    try {
        // identity first: fbevents applies init user data only while the pixel has none
        if (typeof window.setPixelUserData === 'function') {
            window.setPixelUserData({
                ph: phone,
                name: name,
                ct: commune,
                st: wilayaName
            });
        }
        // updateTotal shows an offer with its variant adjustment; the order payload stays as posted (the server re-prices)
        const icAdj = selectedOffer ? (parseFloat(getTotalVariantAdjustment()) || 0) : 0;
        if (typeof window.trackPixelEvent === 'function') {
            window.trackPixelEvent('InitiateCheckout', {
                value: subtotal + icAdj,
                currency: 'DZD',
                content_type: 'product',
                content_ids: [PD.productId],
                content_id: PD.productId,
                contents: [{
                    id: PD.productId,
                    quantity: itemQty,
                    item_price: selectedOffer ? (itemPrice + icAdj) / (itemQty || 1) : itemPrice
                }],
                num_items: itemQty
            });
        }
    } catch (e) {}

    if (!orderData.altcha_response) {
        await _captcha_ready();
        orderData.altcha_response = _captcha_value();
    }

    // image-addon bodies are multi-MB base64; the flag only sizes the client timeout below
    const _fcHasImageAddon = orderData.items.some(it =>
        Array.isArray(it.addons) && it.addons.some(a => a && a.input_type === 'image' && a.value)
    );

    try {
        const _fcBody = JSON.stringify(orderData);
        // 40s base (Algerian 3G/2G POSTs can need 30s); image-addon bodies are multi-MB base64: one extra second per 50 KB, capped so the wait stays under fpm's 180 s.
        const _fcTimeoutMs = 40000 + (_fcHasImageAddon ? Math.min(120000, Math.ceil(_fcBody.length / 50000) * 1000) : 0);
        window._fcSubmitWindowMs = _fcTimeoutMs + 5000;
        // WebViews before Chrome 66 have no AbortController: they send without the client timeout.
        const _fcAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const _fcTimeoutId = _fcAbort ? setTimeout(() => _fcAbort.abort(), _fcTimeoutMs) : 0;
        const response = await fetch('/api/orders', {
            method: 'POST',
            // no keepalive: the InitiateCheckout pixel beacons above share its 64 KiB in-flight budget and in-app browsers then refuse the order (the landing-page form never used it)
            headers: {
                'Content-Type': 'application/json'
            },
            body: _fcBody,
            signal: _fcAbort ? _fcAbort.signal : undefined
        });
        clearTimeout(_fcTimeoutId);

        let result;
        try {
            const text = await response.text();
            result = JSON.parse(text);
        } catch (e) {
            // Non-JSON response (Cloudflare error page, WAF block, fpm 502 HTML, etc.)
            // Treat as failure — never fake success, never redirect to a fake order page.
            console.error('Parse error:', e);
            if (window.dzErr) window.dzErr('order_submit_failed', {
                s: response.status,
                r: 'non_json',
                m: e && e.message
            });
            result = {
                success: false,
                message: storeLang === 'fr' ?
                    'Erreur réseau. Veuillez réessayer.' :
                    'حدث خطأ في الإتصال. الرجاء المحاولة مرة أخرى.'
            };
        }

        if (result.success) {
            // Mark abandoned cart as recovered (prevent re-capture)
            abandonedCartCaptured = true;
            clearTimeout(abandonedCartTimeout);

            // Purchase pixel fires on order-success page (single source of truth)
            // Success chime also fires on order-success page (synced with checkmark animation)

            showToast(storeLang === 'fr' ? 'Commande confirmée! ✓' : 'تم تأكيد طلبك بنجاح! ✓');
            setTimeout(() => {
                var successId = result.order_number || result.order_id || 'success';
                window.location.href = '/order-success/' + successId;
            }, 400);
        } else {
            showToast(result.message || (storeLang === 'fr' ? 'Une erreur est survenue' : 'حدث خطأ، حاول مرة أخرى'), 'error');
            // Refresh ALTCHA so the retry submits a FRESH payload — the
            // server-side replay gate rejects a consumed payload, which
            // used to permanently block buyers who hit a validation error
            // then resubmitted (the "disable VPN" loop). No-op when the
            // captcha-protection addon is not active for this store.
            try {
                _captcha_refresh();
            } catch (e) {}
            btn.classList.remove('loading');
            btn.disabled = false;
            window._fcSubmitting = false;
        }
    } catch (error) {
        console.error('Error:', error);
        if (window.dzErr) window.dzErr(error && error.name === 'AbortError' ? 'order_submit_timeout' : 'order_submit_failed', {
            s: 0,
            r: (error && error.name) || 'error',
            m: error && error.message
        });
        // Network error — never fake success. Tell the user, let them retry.
        // (Worst case = duplicate order, which the merchant can cancel.
        //  Previous behavior was silent loss, which is unrecoverable.)
        showToast(storeLang === 'fr' ?
            'Erreur de connexion. Veuillez réessayer.' :
            'حدث خطأ في الإتصال. الرجاء المحاولة مرة أخرى.', 'error');
        // The request may have reached the server even on a client
        // network error — the payload could already be consumed. Refresh.
        try {
            _captcha_refresh();
        } catch (e) {}
        btn.classList.remove('loading');
        btn.disabled = false;
        window._fcSubmitting = false;
    }
}

// Initialize free shipping progress after all functions are defined
setTimeout(function() {
    if (typeof updateFreeShippingProgress === 'function') {
        updateFreeShippingProgress();
    }
}, 100);

if (PD.fcPromoEnabled) {
    // ==========================================
    // Promo Code Functions for Fast Checkout
    // ==========================================
    function showFcPromoModal() {
        const existing = document.getElementById('fcPromoOverlay');
        if (existing) existing.remove();

        const overlayHtml = `
    <div id="fcPromoOverlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 20px;" onclick="if(event.target===this)closeFcPromoModal()">
        <div style="background: #fff; border-radius: 20px; width: 100%; max-width: 380px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: fcPromoIn 0.25s ease;">
            <div style="text-align: center; margin-bottom: 18px;">
                <div style="width: 52px; height: 52px; background: linear-gradient(135deg, #fff7ed, #ffedd5); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                    <i class="bi bi-tag-fill" style="font-size: 1.5rem; color: #f97316;"></i>
                </div>
                <h2 style="font-weight: 700; color: #1f2937; margin: 0; font-size: 1.05rem;">${storeLang === 'fr' ? 'Utiliser un code promo' : 'إستخدم رمز ترويجي'}</h2>
            </div>
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-weight: 600; font-size: 0.85rem; color: #374151; margin-bottom: 5px;">
                    ${storeLang === 'fr' ? 'Code promotionnel' : 'الرمز الترويجي'}
                </label>
                <input type="text" id="fcPromoCodeInput" placeholder="${storeLang === 'fr' ? 'Entrez le code...' : 'أدخل الرمز...'}"
                       style="width: 100%; padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 0.95rem; text-align: center; letter-spacing: 2px; text-transform: uppercase; outline: none; box-sizing: border-box; transition: border-color 0.2s;"
                       onfocus="this.style.borderColor='#f97316'" onblur="this.style.borderColor='#e5e7eb'"
                       maxlength="30" autocomplete="off"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();applyFcPromoCode()}">
                <div id="fcPromoError" style="display: none; color: #dc2626; font-size: 0.82rem; margin-top: 5px; text-align: center;"></div>
                <div id="fcPromoSuccess" style="display: none; color: #16a34a; font-size: 0.82rem; margin-top: 5px; text-align: center;"></div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" onclick="applyFcPromoCode()" id="fcApplyPromoBtn"
                        style="flex: 1; padding: 10px; background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; border: none; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer;">
                    ${storeLang === 'fr' ? 'Appliquer' : 'تطبيق'}
                </button>
                <button type="button" onclick="closeFcPromoModal()"
                        style="flex: 1; padding: 10px; background: #f3f4f6; color: #374151; border: none; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer;">
                    ${storeLang === 'fr' ? 'Fermer' : 'إغلاق'}
                </button>
            </div>
        </div>
    </div>`;

        // Add animation keyframes if not already added
        if (!document.getElementById('fcPromoStyle')) {
            const style = document.createElement('style');
            style.id = 'fcPromoStyle';
            style.textContent = '@keyframes fcPromoIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }';
            document.head.appendChild(style);
        }

        document.body.insertAdjacentHTML('beforeend', overlayHtml);
        setTimeout(() => {
            const inp = document.getElementById('fcPromoCodeInput');
            if (inp) inp.focus();
        }, 200);
    }

    function closeFcPromoModal() {
        const overlay = document.getElementById('fcPromoOverlay');
        if (overlay) overlay.remove();
    }

    // Robust JSON POST wrapper for /api/promo/validate (1 silent retry, JSON content-type
    // check, no-cache, console diagnostic). Heals transient network blips, ad-blocker race
    // conditions, and short-lived Cloudflare Browser Integrity Check delays.
    function _fcPromoValidatePost(url, payload) {
        var opts = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
            credentials: 'same-origin'
        };

        function _attempt() {
            return fetch(url, opts).then(function(r) {
                var ct = (r.headers.get('content-type') || '').toLowerCase();
                if (ct.indexOf('application/json') === -1) {
                    var err = new Error('non-json-response');
                    err.httpStatus = r.status;
                    throw err;
                }
                return r.json().then(function(j) {
                    j.__httpStatus = r.status;
                    return j;
                });
            });
        }
        return _attempt().catch(function(err1) {
            return new Promise(function(res) {
                setTimeout(res, 600);
            }).then(_attempt).catch(function(err2) {
                try {
                    console.warn('[promo/validate] failed after 1 retry', err1, err2);
                } catch (e) {}
                err2.firstError = err1;
                throw err2;
            });
        });
    }

    function _fcPromoErrorMessage(err, storeLang) {
        var st = err && err.httpStatus;
        if (st === 429) return storeLang === 'fr' ? 'Trop de tentatives, réessayez dans une minute' : 'محاولات كثيرة، حاول بعد دقيقة';
        if (st && st >= 500) return storeLang === 'fr' ? 'Service indisponible, réessayez plus tard' : 'الخدمة غير متاحة، حاول لاحقاً';
        return storeLang === 'fr' ? 'Erreur de connexion, vérifiez votre internet' : 'تعذّر الاتصال، تحقق من إنترنتك';
    }

    function applyFcPromoCode() {
        const code = document.getElementById('fcPromoCodeInput').value.trim();
        if (!code) {
            const errEl = document.getElementById('fcPromoError');
            errEl.textContent = storeLang === 'fr' ? 'Veuillez entrer un code' : 'يرجى إدخال الرمز';
            errEl.style.display = 'block';
            document.getElementById('fcPromoSuccess').style.display = 'none';
            return;
        }

        const btn = document.getElementById('fcApplyPromoBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        document.getElementById('fcPromoError').style.display = 'none';
        document.getElementById('fcPromoSuccess').style.display = 'none';

        // Calculate current subtotal
        const fcQtyInput = document.getElementById('fc_quantity');
        const qty = parseInt(fcQtyInput ? fcQtyInput.value : 1) || 1;
        const addons = typeof getAddonValues === 'function' ? getAddonValues() : [];
        const totalAddonPrice = addons.reduce((sum, a) => sum + (parseFloat(a.extra_price) || 0), 0);
        const adjustedPrice = basePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0) + totalAddonPrice;
        const currentSubtotal = (typeof selectedOffer !== 'undefined' && selectedOffer) ? (selectedOffer.price + totalAddonPrice) : (adjustedPrice * qty);

        _fcPromoValidatePost('/api/promo/validate', {
                code: code,
                subtotal: currentSubtotal
            })
            .then(result => {
                if (result.success) {
                    fcAppliedPromoCode = code.toUpperCase();
                    fcAppliedDiscount = parseFloat(result.discount_amount) || 0;
                    fcAppliedPromoId = result.promo_id || null;

                    const successEl = document.getElementById('fcPromoSuccess');
                    successEl.textContent = (storeLang === 'fr' ? 'Réduction: -' : 'التخفيض: -') + String(Math.round((fcAppliedDiscount) * 100) / 100) + ' ' + currencySymbol;
                    successEl.style.display = 'block';

                    // Update fast checkout UI
                    document.getElementById('fcPromoLine').style.display = 'block';
                    document.getElementById('fcPromoCodeLabel').textContent = fcAppliedPromoCode;
                    document.getElementById('fcPromoDiscountDisplay').textContent = '-' + String(Math.round((fcAppliedDiscount) * 100) / 100) + ' ' + currencySymbol;
                    document.getElementById('fcPromoBtnWrap').style.display = 'none';

                    // Update total display
                    updateFcTotal();

                    setTimeout(() => closeFcPromoModal(), 1000);
                } else {
                    const errEl = document.getElementById('fcPromoError');
                    errEl.textContent = result.message || (storeLang === 'fr' ? 'Code invalide' : 'الرمز غير صالح');
                    errEl.style.display = 'block';
                }
                btn.disabled = false;
                btn.innerHTML = storeLang === 'fr' ? 'Appliquer' : 'تطبيق';
            })
            .catch(err => {
                document.getElementById('fcPromoError').textContent = _fcPromoErrorMessage(err, storeLang);
                document.getElementById('fcPromoError').style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = storeLang === 'fr' ? 'Appliquer' : 'تطبيق';
            });
    }

    function removeFcPromoCode() {
        fcAppliedPromoCode = null;
        fcAppliedDiscount = 0;
        fcAppliedPromoId = null;
        document.getElementById('fcPromoLine').style.display = 'none';
        document.getElementById('fcPromoBtnWrap').style.display = 'block';
        updateFcTotal();
    }

    function updateFcTotal() {
        const totalEl = document.getElementById('fcTotalValue');
        if (!totalEl) return;
        const fcQtyInput = document.getElementById('fc_quantity');
        const qty = parseInt(fcQtyInput ? fcQtyInput.value : 1) || 1;
        const addons = typeof getAddonValues === 'function' ? getAddonValues() : [];
        const totalAddonPrice = addons.reduce((sum, a) => sum + (parseFloat(a.extra_price) || 0), 0);
        const adjustedPrice = basePrice + (typeof variantPriceAdjustment !== 'undefined' ? variantPriceAdjustment : 0) + totalAddonPrice;
        const sub = (typeof selectedOffer !== 'undefined' && selectedOffer) ? (selectedOffer.price + totalAddonPrice) : (adjustedPrice * qty);
        const total = Math.max(0, sub + selectedShippingPrice + fcWeightSurchargeForTotal() - fcAppliedDiscount);
        totalEl.textContent = String(Math.round((total) * 100) / 100) + ' ' + currencySymbol;
    }
}

// Replay a floating-bar tap that landed before this script was parsed
// (see the early-tap guard emitted right after the mobile bar markup).
// 15s window: older than that means the user moved on — don't yank them.
if (window.__fbEarlyTap && window.__fbEarlyTap.fn && (Date.now() - window.__fbEarlyTap.t) < 15000) {
    (function() {
        var _et = window.__fbEarlyTap;
        window.__fbEarlyTap = null;
        setTimeout(function() {
            try {
                if (_et.fn === 'addToCart') {
                    addToCart();
                } else {
                    buyNow();
                }
            } catch (e) {
                console.warn('Early-tap replay failed:', e);
            }
        }, 300);
    })();
}

// ===== Stop-desk delivery addon (moved from its inline block; runs after the core above) =====
(function() {
    // Pre-loaded desk availability: wilaya_id → desk_count (from linked providers)
    const deskAvailability = PD.deskAvailability;

    const fcDeskCache = {};
    // Fetch-cancellation token: each loadFcDesks() bumps it; late responses for a
    // previous wilaya short-circuit. Prevents stale options leaking into the dropdown.
    let _deskFetchSeq = 0;
    const deskWrapper = document.getElementById('fc_desk_wrapper');
    const deskSelect = document.getElementById('fc_desk_select');
    const communeWrapper = document.getElementById('fc_commune_wrapper');
    const deskIdField = document.getElementById('fc_desk_id');
    const deskNameField = document.getElementById('fc_desk_name');
    const deskDetails = document.getElementById('fc_desk_details');
    const addressWrapper = document.getElementById('fc_address_wrapper');
    const deliveryOpts = document.getElementById('deliveryOptions');
    const wilayaWrapper = document.getElementById('fc_wilaya_wrapper');
    const lang = PD.storeLang;

    if (!deskWrapper || !deskSelect || !deskIdField || !deskNameField) return;

    // --- INITIAL LAYOUT: hide commune, desk, address. Only wilaya visible. ---
    // Record whether address was originally visible (store setting)
    const addressOriginallyVisible = addressWrapper && addressWrapper.style.display !== 'none';
    if (communeWrapper) communeWrapper.style.display = 'none';
    deskWrapper.style.display = 'none';
    if (addressWrapper) addressWrapper.style.display = 'none';
    // Remove commune required until home is selected
    var fcCommune = document.getElementById('fc_commune');
    if (fcCommune) fcCommune.removeAttribute('required');

    // --- MOVE delivery type radios right after the wilaya row ---
    var wilayaRow = wilayaWrapper ? wilayaWrapper.closest('.fc-row') : null;
    if (wilayaRow && deliveryOpts) {
        wilayaRow.parentNode.insertBefore(deliveryOpts, wilayaRow.nextSibling);
    }

    // --- MOVE the desk selector directly BELOW the delivery toggle ---
    // In every FC theme's markup the desk wrapper sits ABOVE the home/desk
    // radios, so picking "desk" revealed the selector up-screen where shoppers
    // miss it. Placing it right after the toggle keeps it in view.
    if (deliveryOpts && deliveryOpts.parentNode) {
        deliveryOpts.parentNode.insertBefore(deskWrapper, deliveryOpts.nextSibling);
        deskWrapper.style.gridColumn = '1 / -1'; // full row in grid-based FC themes
    }

    const deskTxt = {
        selectWilaya: lang === 'fr' ? '-- Choisir la wilaya d\'abord --' : '-- اختر الولاية أولاً --',
        selectDesk: lang === 'fr' ? '-- Choisir le bureau --' : '-- اختر المكتب --',
        loading: lang === 'fr' ? 'Chargement...' : 'جاري التحميل...',
        noDesks: lang === 'fr' ? 'Aucun bureau disponible' : 'لا توجد مكاتب متاحة',
        phone: lang === 'fr' ? 'Tél: ' : 'هاتف: ',
        noDeskWilaya: lang === 'fr' ? 'La livraison au bureau n\'est pas disponible dans cette wilaya' : 'التوصيل لنقطة الاستلام غير متوفر في هذه الولاية',
    };

    function clearDeskSelection() {
        deskIdField.value = '';
        deskNameField.value = '';
        if (deskDetails) deskDetails.style.display = 'none';
    }

    // Show/hide based on delivery type
    function applyDeliveryLayout(type) {
        if (type === 'home') {
            // Home: show commune, show address if store has it enabled, hide desk
            if (communeWrapper) communeWrapper.style.display = '';
            if (fcCommune) fcCommune.setAttribute('required', '');
            if (addressWrapper && addressOriginallyVisible) addressWrapper.style.display = '';
            deskWrapper.style.display = 'none';
            clearDeskSelection();
        } else if (type === 'desk') {
            // Desk: hide commune, hide address, show desk selector
            if (communeWrapper) communeWrapper.style.display = 'none';
            if (fcCommune) fcCommune.removeAttribute('required');
            if (addressWrapper) addressWrapper.style.display = 'none';
            deskWrapper.style.display = '';
            var wId = document.getElementById('fc_wilaya').value;
            if (wId) {
                // Variant/qty/offer changes re-run updateDeliveryOptions -> selectDelivery('desk')
                // -> this layout hook. Reloading here rebuilt the dropdown and WIPED the
                // shopper's chosen desk. If this wilaya's list is already loaded, keep it
                // and just resync the hidden fields from the current selection.
                if (deskSelect.dataset.loadedWilaya === String(wId) && !deskSelect.disabled && deskSelect.options.length > 1) {
                    deskSelect.dispatchEvent(new Event('change'));
                } else {
                    loadFcDesks(wId);
                }
            }
        } else {
            // No type selected: hide all
            if (communeWrapper) communeWrapper.style.display = 'none';
            if (fcCommune) fcCommune.removeAttribute('required');
            if (addressWrapper) addressWrapper.style.display = 'none';
            deskWrapper.style.display = 'none';
            clearDeskSelection();
        }
    }

    function loadFcDesks(wilayaId) {
        var myFetchId = ++_deskFetchSeq;
        if (!wilayaId) {
            deskSelect.innerHTML = '<option value="">' + deskTxt.selectWilaya + '</option>';
            deskSelect.disabled = true;
            clearDeskSelection();
            return;
        }
        if (fcDeskCache[wilayaId]) {
            renderFcDesks(fcDeskCache[wilayaId]);
            return;
        }
        deskSelect.innerHTML = '<option value="">' + deskTxt.loading + '</option>';
        deskSelect.disabled = true;

        fetch('/api/desks/' + encodeURIComponent(wilayaId))
            .then(function(r) {
                return r.json();
            })
            .then(function(data) {
                if (myFetchId !== _deskFetchSeq) return; // superseded by newer call
                var desks = data.desks || [];
                fcDeskCache[wilayaId] = desks;
                renderFcDesks(desks);
            })
            .catch(function() {
                if (myFetchId !== _deskFetchSeq) return;
                deskSelect.innerHTML = '<option value="">' + deskTxt.noDesks + '</option>';
                deskSelect.disabled = true;
            });
    }

    function renderFcDesks(desks) {
        if (desks.length === 0) {
            deskSelect.innerHTML = '<option value="">' + deskTxt.noDesks + '</option>';
            deskSelect.disabled = true;
            delete deskSelect.dataset.loadedWilaya;
            clearDeskSelection();
            // Fallback: switch to home delivery
            applyDeliveryLayout('home');
            // Auto-select home radio and update delivery type
            var homeRadio = document.getElementById('radioHome');
            if (homeRadio && !homeRadio.disabled) {
                homeRadio.checked = true;
                if (typeof selectDelivery === 'function') selectDelivery('home');
            }
            return;
        }
        var html = '<option value="">' + deskTxt.selectDesk + '</option>';
        desks.forEach(function(d) {
            var communeName = lang === 'fr' ?
                (d.commune_name_fr || d.commune_name_ar || '') :
                (d.commune_name_ar || d.commune_name_fr || '');
            // Prefer the server-resolved label (custom_name for customecotrack, canonical
            // platform name otherwise). Fallback preserves old UX during deploy gaps.
            var provider = d.provider_label || ((d.provider || '').charAt(0).toUpperCase() + (d.provider || '').slice(1));
            var isCommune = d.desk_type === 'commune';
            var label = provider + ' — ' + (communeName || d.desk_name);
            if (!isCommune) {
                var shortAddr = (d.desk_address || '').length > 50 ?
                    (d.desk_address || '').substring(0, 50) + '...' :
                    (d.desk_address || '');
                if (shortAddr) label += ' | ' + shortAddr;
            }
            var optValue = isCommune ? 'c_' + d.commune_id + '_' + d.provider : d.id;
            var deskName = isCommune ? (provider + ' — ' + communeName) : (d.desk_name || '');
            html += '<option value="' + optValue + '" ' +
                'data-name="' + (deskName).replace(/"/g, '&quot;') + '" ' +
                'data-address="' + (d.desk_address || '').replace(/"/g, '&quot;') + '" ' +
                'data-phone="' + (d.desk_phone || '').replace(/"/g, '&quot;') + '" ' +
                'data-provider="' + (d.provider || '').replace(/"/g, '&quot;') + '" ' +
                'data-type="' + (d.desk_type || 'desk') + '" ' +
                'data-commune-ar="' + (d.commune_name_ar || '').replace(/"/g, '&quot;') + '"' +
                '>' + label + '</option>';
        });
        deskSelect.innerHTML = html;
        deskSelect.disabled = false;
        deskSelect.dataset.loadedWilaya = String(document.getElementById('fc_wilaya').value || '');
    }

    // Desk selection change handler
    deskSelect.addEventListener('change', function() {
        var opt = this.options[this.selectedIndex];
        if (!this.value) {
            clearDeskSelection();
            return;
        }
        deskIdField.value = opt.dataset.type === 'commune' ? '' : this.value;
        deskNameField.value = opt.dataset.name || '';
        // Also set commune from desk for order storage
        var communeAr = opt.dataset.communeAr || '';
        var communeEl = document.getElementById('fc_commune');
        if (communeEl && communeAr) {
            if (communeEl.tagName === 'SELECT') {
                for (var i = 0; i < communeEl.options.length; i++) {
                    if (communeEl.options[i].value === communeAr) {
                        communeEl.selectedIndex = i;
                        break;
                    }
                }
            } else {
                communeEl.value = communeAr;
            }
        }
        // Show details
        var name = opt.dataset.name || '';
        var addr = opt.dataset.address || '';
        var phone = opt.dataset.phone || '';
        if (deskDetails && (name || addr)) {
            document.getElementById('fc_desk_detail_name').textContent = name;
            document.getElementById('fc_desk_detail_address').textContent = addr;
            var phoneEl = document.getElementById('fc_desk_detail_phone');
            phoneEl.textContent = phone ? deskTxt.phone + phone : '';
            phoneEl.style.display = phone ? '' : 'none';
            deskDetails.style.display = '';
        } else if (deskDetails) {
            deskDetails.style.display = 'none';
        }
        // Clear desk error
        var errEl = document.getElementById('fc_desk_error');
        if (errEl) errEl.style.display = 'none';
    });

    // Hook into selectDelivery to apply layout
    var _origSelectDelivery = window.selectDelivery;
    window.selectDelivery = function(type, isManual) {
        _origSelectDelivery(type, isManual);
        applyDeliveryLayout(type);
    };

    // --- Desk availability pre-check: wrap updateDeliveryOptions ---
    // Prevents desk option from appearing when no actual desks exist for the wilaya
    var _origUpdateDeliveryOptions = window.updateDeliveryOptions;
    window.updateDeliveryOptions = function() {
        var wilayaId = document.getElementById('fc_wilaya').value;
        var hasDesks = wilayaId && deskAvailability[wilayaId] > 0;
        // Desk availability is WILAYA-level: force the commune desk flag ON when the
        // wilaya has provider desks (so a commune without a local desk still shows the
        // desk option and the customer can pick a desk elsewhere in the wilaya), and OFF
        // when it has none. The merchant's wilaya desk_delivery_enabled still gates the
        // option inside _origUpdateDeliveryOptions. Restored right after so the real
        // commune flag is untouched for the next call.
        var savedCDesk = window._fcCommuneDesk;
        if (!hasDesks) {
            window._fcCommuneDesk = 0;
        } else {
            window._fcCommuneDesk = 1;
        }
        _origUpdateDeliveryOptions();
        window._fcCommuneDesk = savedCDesk;
        // Show/hide "desk not available" info
        var noDeskMsg = document.getElementById('fc_no_desk_msg');
        var rateHasDesk = false;
        if (wilayaId) {
            var rate = window.shippingRates ? (window.shippingRates[wilayaId] || window.shippingRates[String(wilayaId)]) : null;
            rateHasDesk = rate ? (rate.desk_delivery_enabled == 1) : !window.hasShippingRates;
        }
        if (wilayaId && rateHasDesk && !hasDesks) {
            if (!noDeskMsg) {
                noDeskMsg = document.createElement('div');
                noDeskMsg.id = 'fc_no_desk_msg';
                noDeskMsg.style.cssText = 'margin-top:6px;padding:6px 10px;border-radius:6px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);color:#92400e;font-size:0.78rem;display:flex;align-items:center;gap:5px;';
                noDeskMsg.innerHTML = '<i class="bi bi-info-circle"></i><span>' + deskTxt.noDeskWilaya + '</span>';
                var deliveryEl = document.getElementById('deliveryOptions');
                if (deliveryEl) deliveryEl.parentNode.insertBefore(noDeskMsg, deliveryEl.nextSibling);
            }
            noDeskMsg.style.display = '';
        } else if (noDeskMsg) {
            noDeskMsg.style.display = 'none';
        }
    };

    // On wilaya change, reset layout based on current delivery type.
    // We also explicitly reset the <select> contents — clearDeskSelection only clears
    // the hidden form fields, leaving the previous wilaya's options (and possibly
    // a selected stale value) sitting in the dropdown DOM. The fetch-token in
    // loadFcDesks() also ensures any in-flight prior-wilaya fetch can't write into
    // the dropdown after we reset it here.
    document.getElementById('fc_wilaya').addEventListener('change', function() {
        deskSelect.value = '';
        deskSelect.innerHTML = '<option value="">' + deskTxt.selectWilaya + '</option>';
        deskSelect.disabled = true;
        clearDeskSelection();
        if (typeof selectedDeliveryType !== 'undefined' && selectedDeliveryType === 'desk' && this.value) {
            loadFcDesks(this.value); // overwrites placeholder with fresh options
        }
    });

    // Hook into submitFastCheckout validation: require desk when desk delivery selected
    var _origSubmitFc = window.submitFastCheckout;
    window.submitFastCheckout = function(event) {
        if (typeof selectedDeliveryType !== 'undefined' && selectedDeliveryType === 'desk') {
            if (!deskSelect.value) {
                event.preventDefault();
                var errEl = document.getElementById('fc_desk_error');
                if (errEl) errEl.style.display = 'block';
                deskWrapper.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                deskWrapper.style.animation = 'shake 0.5s ease';
                setTimeout(function() {
                    deskWrapper.style.animation = '';
                }, 500);
                return;
            }
            // When desk selected, ensure commune has value for order storage
            var communeEl = document.getElementById('fc_commune');
            if (communeEl && !communeEl.value) {
                var opt = deskSelect.options[deskSelect.selectedIndex];
                if (opt && opt.dataset.communeAr) {
                    if (communeEl.tagName === 'SELECT') {
                        for (var i = 0; i < communeEl.options.length; i++) {
                            if (communeEl.options[i].value === opt.dataset.communeAr) {
                                communeEl.selectedIndex = i;
                                break;
                            }
                        }
                        if (!communeEl.value) {
                            var tmpOpt = document.createElement('option');
                            tmpOpt.value = opt.dataset.communeAr;
                            tmpOpt.textContent = opt.dataset.communeAr;
                            tmpOpt.selected = true;
                            communeEl.appendChild(tmpOpt);
                        }
                    } else {
                        communeEl.value = opt.dataset.communeAr;
                    }
                }
            }
        }
        return _origSubmitFc(event);
    };
})();

// ===== Pickup-from-store addon (third delivery option). Markup is PHP-gated on
// the addon being active + ≥1 active pickup point, so this section is a no-op
// (early return) for every other store. MUST stay after the stop-desk section
// so its wrappers compose on top of stop-desk's wrappers. =====
(function() {
    var pickupWrapper = document.getElementById('fc_pickup_wrapper');
    var pickupSelect = document.getElementById('fc_pickup_select');
    var pickupIdField = document.getElementById('fc_pickup_id');
    var radioPickup = document.getElementById('radioPickup');
    if (!pickupWrapper || !pickupSelect || !pickupIdField || !radioPickup || !PD.pickupEnabled) return;

    var pickupAvailability = PD.pickupAvailability || {};
    var pickupDetails = document.getElementById('fc_pickup_details');
    var labelPickup = document.getElementById('labelPickup');
    var pricePickup = document.getElementById('pricePickup');
    var pkAddressWrapper = document.getElementById('fc_address_wrapper');
    var pkCommune = document.getElementById('fc_commune');
    var pkCommuneWrapper = document.getElementById('fc_commune_wrapper') ||
        (pkCommune ? pkCommune.closest('.fc-input-wrapper, .fcc-field, .fck-field, .fce-field, .fcs-field') : null);
    var hasStopDesk = !!document.getElementById('fc_desk_wrapper');
    var communeOriginallyRequired = !!(pkCommune && pkCommune.hasAttribute('required'));
    var pkLang = PD.storeLang;
    var pickupTxt = {
        selectWilaya: pkLang === 'fr' ? '-- Choisir la wilaya d\'abord --' : '-- اختر الولاية أولاً --',
        selectPoint: pkLang === 'fr' ? '-- Choisir le point de retrait --' : '-- اختر نقطة الاستلام --',
        loading: pkLang === 'fr' ? 'Chargement...' : 'جاري التحميل...',
        noPoints: pkLang === 'fr' ? 'Aucun point disponible' : 'لا توجد نقاط متاحة',
        free: pkLang === 'fr' ? 'Gratuit' : 'مجاني',
        phone: pkLang === 'fr' ? 'Tél: ' : 'هاتف: '
    };
    var fcPickupCache = {};
    var _pickupFetchSeq = 0;

    function clearPickupSelection() {
        pickupIdField.value = '';
        if (pickupDetails) pickupDetails.style.display = 'none';
    }

    function setPickupPlaceholder(text) {
        pickupSelect.textContent = '';
        var o = document.createElement('option');
        o.value = '';
        o.textContent = text;
        pickupSelect.appendChild(o);
        pickupSelect.disabled = true;
    }

    function renderFcPickup(points) {
        pickupSelect.textContent = '';
        var o0 = document.createElement('option');
        o0.value = '';
        o0.textContent = points.length ? pickupTxt.selectPoint : pickupTxt.noPoints;
        pickupSelect.appendChild(o0);
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            var o = document.createElement('option');
            o.value = String(p.id);
            var commune = pkLang === 'fr' ? (p.commune_name_fr || p.commune_name_ar || '') : (p.commune_name_ar || p.commune_name_fr || '');
            var label = p.name || '';
            if (commune) label += ' — ' + commune;
            var addr = p.address || '';
            if (addr) label += ' | ' + (addr.length > 50 ? addr.substring(0, 50) + '...' : addr);
            o.textContent = label;
            o.setAttribute('data-name', p.name || '');
            o.setAttribute('data-address', addr);
            o.setAttribute('data-phone', p.phone || '');
            o.setAttribute('data-commune-ar', p.commune_name_ar || '');
            pickupSelect.appendChild(o);
        }
        pickupSelect.disabled = points.length === 0;
        if (points.length === 0) {
            clearPickupSelection();
            // No live points despite the availability map (deactivated in the
            // meantime) → fall back to home like the desk selector does.
            if (typeof selectedDeliveryType !== 'undefined' && selectedDeliveryType === 'pickup') {
                var rh = document.getElementById('radioHome');
                if (rh && !rh.disabled) selectDelivery('home');
            }
        }
    }

    function loadFcPickup(wilayaId) {
        var myFetchId = ++_pickupFetchSeq;
        if (!wilayaId) {
            setPickupPlaceholder(pickupTxt.selectWilaya);
            clearPickupSelection();
            return;
        }
        if (fcPickupCache[wilayaId]) {
            renderFcPickup(fcPickupCache[wilayaId]);
            return;
        }
        setPickupPlaceholder(pickupTxt.loading);
        fetch('/api/pickup-points/' + wilayaId)
            .then(function(r) {
                return r.json();
            })
            .then(function(data) {
                if (myFetchId !== _pickupFetchSeq) return;
                var points = data.points || [];
                fcPickupCache[wilayaId] = points;
                renderFcPickup(points);
            })
            .catch(function() {
                if (myFetchId !== _pickupFetchSeq) return;
                renderFcPickup([]);
            });
    }

    // Layout for pickup mode. For non-pickup we only undo what WE changed —
    // the core/stop-desk chain owns commune/address for home/desk.
    function applyPickupLayout(showPickup) {
        if (showPickup) {
            if (pkAddressWrapper) pkAddressWrapper.style.display = 'none';
            if (pkCommuneWrapper) pkCommuneWrapper.style.display = 'none';
            if (pkCommune) pkCommune.removeAttribute('required');
            // Entering pickup mode: hide the stop-desk selector if it's showing.
            // selectDelivery('pickup') returns early without running the stop-desk
            // layout, so nothing else hides #fc_desk_wrapper on a desk→pickup switch
            // — that's what left BOTH the desk and pickup selectors visible. Mirror
            // checkout.php, which hides its desk wrapper on the same transition.
            if (hasStopDesk) {
                var pkDeskWrapper = document.getElementById('fc_desk_wrapper');
                if (pkDeskWrapper) pkDeskWrapper.style.display = 'none';
            }
            pickupWrapper.style.display = '';
            var wId = document.getElementById('fc_wilaya').value;
            if (wId) loadFcPickup(wId);
        } else {
            pickupWrapper.style.display = 'none';
            clearPickupSelection();
            if (!hasStopDesk) {
                // Without stop-desk nothing else restores the commune we hid.
                if (pkCommuneWrapper) pkCommuneWrapper.style.display = '';
                if (pkCommune && communeOriginallyRequired) pkCommune.setAttribute('required', '');
            }
        }
    }

    pickupSelect.addEventListener('change', function() {
        var opt = this.options[this.selectedIndex];
        if (!this.value) {
            clearPickupSelection();
            return;
        }
        pickupIdField.value = this.value;
        if (pickupDetails) {
            var nameEl = document.getElementById('fc_pickup_detail_name');
            var addrEl = document.getElementById('fc_pickup_detail_address');
            var phoneEl = document.getElementById('fc_pickup_detail_phone');
            var phone = opt.getAttribute('data-phone') || '';
            if (nameEl) nameEl.textContent = opt.getAttribute('data-name') || '';
            if (addrEl) addrEl.textContent = opt.getAttribute('data-address') || '';
            if (phoneEl) {
                phoneEl.textContent = phone ? pickupTxt.phone + phone : '';
                phoneEl.style.display = phone ? '' : 'none';
            }
            pickupDetails.style.display = '';
        }
        var errEl = document.getElementById('fc_pickup_error');
        if (errEl) errEl.style.display = 'none';
    });

    // selectDelivery: handle the pickup type ourselves, delegate the rest.
    var _pkPrevSelectDelivery = window.selectDelivery;
    window.selectDelivery = function(type, isManual) {
        if (type === 'pickup') {
            if (radioPickup.disabled) return;
            radioPickup.checked = true;
            selectedDeliveryType = 'pickup';
            selectedShippingPrice = 0;
            if (isManual) userManuallySelectedDelivery = true;
            applyPickupLayout(true);
            updateTotal();
            if (typeof window.updateFcGuide === 'function') window.updateFcGuide();
            return;
        }
        _pkPrevSelectDelivery(type, isManual);
        applyPickupLayout(false);
    };

    // updateDeliveryOptions: the core resets/handles home+desk; we manage the
    // pickup radio around it and restore a manual pickup selection.
    var _pkPrevUpdateDeliveryOptions = window.updateDeliveryOptions;
    window.updateDeliveryOptions = function() {
        var prevType = (typeof selectedDeliveryType !== 'undefined') ? selectedDeliveryType : null;
        var prevManual = (typeof userManuallySelectedDelivery !== 'undefined') ? userManuallySelectedDelivery : false;
        _pkPrevUpdateDeliveryOptions();
        var wilayaId = document.getElementById('fc_wilaya').value;
        var hasPickup = wilayaId && pickupAvailability[wilayaId] > 0;
        // Reset pickup radio state (the core only resets home/desk)
        radioPickup.checked = false;
        radioPickup.disabled = true;
        if (labelPickup) labelPickup.classList.add('disabled');
        if (pricePickup) pricePickup.textContent = '--';
        if (hasPickup) {
            radioPickup.disabled = false;
            if (labelPickup) labelPickup.classList.remove('disabled');
            if (pricePickup) {
                pricePickup.textContent = pickupTxt.free;
                pricePickup.style.color = '#22c55e';
                pricePickup.style.fontWeight = '700';
            }
            if (prevType === 'pickup' && prevManual) {
                selectDelivery('pickup');
                userManuallySelectedDelivery = true;
                return;
            }
        }
        // Not pickup (or no longer available): make sure our layout is undone.
        if (prevType === 'pickup' && (typeof selectedDeliveryType === 'undefined' || selectedDeliveryType !== 'pickup')) {
            applyPickupLayout(false);
        }
    };

    // Wilaya change → reset the pickup dropdown; reload when pickup stays selected.
    document.getElementById('fc_wilaya').addEventListener('change', function() {
        setPickupPlaceholder(pickupTxt.selectWilaya);
        clearPickupSelection();
        if (typeof selectedDeliveryType !== 'undefined' && selectedDeliveryType === 'pickup' && this.value) {
            loadFcPickup(this.value);
        }
    });

    // Submit: require a selected point; backfill commune (hidden in pickup mode)
    // from the point's commune so the server's non-empty commune check passes.
    var _pkPrevSubmitFc = window.submitFastCheckout;
    window.submitFastCheckout = function(event) {
        if (typeof selectedDeliveryType !== 'undefined' && selectedDeliveryType === 'pickup') {
            if (!pickupSelect.value) {
                if (event && event.preventDefault) event.preventDefault();
                var errEl = document.getElementById('fc_pickup_error');
                if (errEl) errEl.style.display = 'block';
                pickupWrapper.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                pickupWrapper.style.animation = 'shake 0.5s ease';
                setTimeout(function() {
                    pickupWrapper.style.animation = '';
                }, 500);
                return;
            }
            var communeEl = document.getElementById('fc_commune');
            if (communeEl && !_val(communeEl)) {
                var opt = pickupSelect.options[pickupSelect.selectedIndex];
                var fillVal = (opt && (opt.getAttribute('data-commune-ar') || opt.getAttribute('data-name'))) || '-';
                if (communeEl.tagName === 'SELECT') {
                    var matched = false;
                    for (var i = 0; i < communeEl.options.length; i++) {
                        if (communeEl.options[i].value === fillVal) {
                            communeEl.selectedIndex = i;
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        var tmpOpt = document.createElement('option');
                        tmpOpt.value = fillVal;
                        tmpOpt.textContent = fillVal;
                        tmpOpt.selected = true;
                        communeEl.appendChild(tmpOpt);
                    }
                } else {
                    communeEl.value = fillVal;
                }
            }
        }
        return _pkPrevSubmitFc(event);
    };
})();

// Replay early interactions queued by the sync stubs (see the inline stub
// block emitted before the gallery markup) that landed before this deferred
// script executed. Mirrors the __fbEarlyTap replay pattern above.
if (window.__pdQ && window.__pdQ.length) {
    (function() {
        var q = window.__pdQ;
        window.__pdQ = [];
        setTimeout(function() {
            for (var i = 0; i < q.length; i++) {
                var it = q[i];
                if (Date.now() - it.t > 15000) continue;
                try {
                    var args = it.a;
                    if (it.n === 'submitFastCheckout') {
                        args = [{
                            preventDefault: function() {}
                        }];
                    }
                    if (typeof window[it.n] === 'function') {
                        window[it.n].apply(null, args);
                    }
                } catch (e) {
                    console.warn('Early replay failed:', it.n, e);
                }
            }
        }, 300);
    })();
}

/* ===== Mini cart panel (below fast checkout) — informational only.
   Renders the localStorage cart; removing items only edits localStorage.
   Never touches the fast-checkout submit path. ===== */
(function() {
    var panel = document.getElementById('pdCartPanel');
    if (!panel) return;
    var CUR = panel.getAttribute('data-currency') || '';
    var RM = panel.getAttribute('data-remove-label') || 'x';

    function fmt(n) {
        return String(Math.round((Number(n) || 0) * 100) / 100);
    }

    function readCart() {
        try {
            var c = JSON.parse(_store('localStorage').getItem(cartKey) || '[]');
            return Array.isArray(c) ? c : [];
        } catch (e) {
            return [];
        }
    }

    function itemMatches(a, b) {
        return a.id === b.id &&
            (a.variantKey || '') === (b.variantKey || '') &&
            (a.variantText || '') === (b.variantText || '');
    }

    function removeItem(target) {
        var cart = readCart();
        for (var i = 0; i < cart.length; i++) {
            if (itemMatches(cart[i], target)) {
                cart.splice(i, 1);
                break;
            }
        }
        _store('localStorage').setItem(cartKey, JSON.stringify(cart));
        if (typeof updateCartBadge === 'function') {
            try {
                updateCartBadge();
            } catch (e) {}
        }
        render();
    }

    function render() {
        var cart = readCart();
        var items = document.getElementById('pdCartItems');
        if (!items) return;
        if (!cart.length) {
            panel.hidden = true;
            return;
        }
        items.textContent = '';
        var subtotal = 0,
            count = 0;
        cart.forEach(function(it) {
            subtotal += (Number(it.price) || 0) * (it.quantity || 1);
            count += (it.quantity || 1);
            var row = document.createElement('div');
            row.className = 'pd-cart-row';
            var img = document.createElement('img');
            img.src = it.image || '/assets/placeholder.png';
            img.alt = '';
            img.loading = 'lazy';
            img.onerror = function() {
                this.onerror = null;
                this.src = '/assets/placeholder.png';
            };
            var info = document.createElement('div');
            info.className = 'pd-cart-info';
            var nm = document.createElement('p');
            nm.className = 'pd-cart-name';
            nm.textContent = it.name || '';
            info.appendChild(nm);
            if (it.variantText) {
                var vt = document.createElement('p');
                vt.className = 'pd-cart-variant';
                vt.textContent = it.variantText;
                info.appendChild(vt);
            }
            var pr = document.createElement('span');
            pr.className = 'pd-cart-price';
            pr.textContent = fmt(it.price) + ' ' + CUR + ' × ' + (it.quantity || 1);
            info.appendChild(pr);
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'pd-cart-remove';
            rm.setAttribute('aria-label', RM);
            rm.innerHTML = '<i class="bi bi-x-lg"></i>';
            (function(target) {
                rm.addEventListener('click', function() {
                    removeItem(target);
                });
            })({
                id: it.id,
                variantKey: it.variantKey,
                variantText: it.variantText
            });
            row.appendChild(img);
            row.appendChild(info);
            row.appendChild(rm);
            items.appendChild(row);
        });
        var cnt = document.getElementById('pdCartCount');
        if (cnt) cnt.textContent = count;
        var sub = document.getElementById('pdCartSubtotal');
        if (sub) sub.textContent = fmt(subtotal);
        panel.hidden = false;
    }
    render();
    // Same-page adds (the page's add-to-cart button) — refresh shortly after
    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest && e.target.closest('.btn-cart')) setTimeout(render, 400);
    });
    // Other tabs
    window.addEventListener('storage', function(e) {
        if (e.key === cartKey) render();
    });
    window.__pdCartPanelRefresh = render;
})();