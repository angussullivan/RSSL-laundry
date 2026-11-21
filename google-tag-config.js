/*
  GOOGLE TAG — this is the only file to edit
  ==========================================
  Paste the IDs from Google Analytics and Google Ads below.
  While a value is still the placeholder (or blank), that part stays off:
  Google's script is not requested, and no analytics cookies are set.
  The in-store survey keeps working offline either way. The Google script
  is also skipped whenever the browser is offline.

  1. Google Analytics 4 measurement ID
     Analytics → Admin → Data streams → Web stream → Measurement ID
     Looks like G-AB12CD34EF. Replace G-XXXXXXX.

  2. Google Ads tag ID
     Ads → Tools → Data manager → Google tag
     (or Goals → Conversions → see the tag ID)
     Looks like AW-1234567890. Replace AW-XXXXXXXXX.

  3. Conversion labels (optional, one per action)
     Ads → Goals → Conversions → open the conversion → Tag setup.
     The label is the part after the slash in AW-1234567890/AbCdEfGhIjK.
     Leave a label blank until that conversion exists.

     get_directions  taps on any Google Maps / directions link
     text_us         taps on any sms: link (Text us)
     contact         same sms: taps, if the Ads conversion was named contact

     A text tap sends the Analytics event "text_us". An Ads conversion is
     sent for each of text_us and contact that has a real label. The same
     label is only sent once.

  conversionValue  leave null unless the Ads action requires a value.
  currency         used only when conversionValue is a number.
*/
(function () {
  'use strict';

  window.RSSL_GOOGLE_TAG = {
    ga4MeasurementId: 'G-XXXXXXX',
    googleAdsId: 'AW-XXXXXXXXX',
    conversionLabels: {
      get_directions: '',
      text_us: '',
      contact: ''
    },
    conversionValue: null,
    currency: 'AUD'
  };

  var cfg = window.RSSL_GOOGLE_TAG;

  function isRealGa4(id) {
    return typeof id === 'string' && /^G-[A-Z0-9]{4,}$/i.test(id.trim()) && !/^G-X+$/i.test(id.trim());
  }

  function isRealAds(id) {
    return typeof id === 'string' && /^AW-\d{6,}$/.test(id.trim());
  }

  function isRealLabel(label) {
    if (typeof label !== 'string') return false;
    var value = label.trim();
    if (!value || /X{3,}/i.test(value)) return false;
    return /^[A-Za-z0-9_-]{4,}$/.test(value);
  }

  var ga4 = isRealGa4(cfg.ga4MeasurementId) ? cfg.ga4MeasurementId.trim() : '';
  var ads = isRealAds(cfg.googleAdsId) ? cfg.googleAdsId.trim() : '';

  function labelFor(key) {
    var labels = cfg.conversionLabels || {};
    return isRealLabel(labels[key]) ? labels[key].trim() : '';
  }

  function track(eventName, params) {
    try {
      if (typeof window.gtag !== 'function') return;
      var payload = { transport_type: 'beacon' };
      if (params) {
        for (var key in params) {
          if (Object.prototype.hasOwnProperty.call(params, key)) payload[key] = params[key];
        }
      }
      window.gtag('event', eventName, payload);
      if (!ads) return;
      var labels = [];
      if (eventName === 'get_directions') labels.push(labelFor('get_directions'));
      if (eventName === 'text_us' || eventName === 'contact') {
        labels.push(labelFor('text_us'));
        labels.push(labelFor('contact'));
      }
      var seen = {};
      for (var i = 0; i < labels.length; i++) {
        var label = labels[i];
        if (!label || seen[label]) continue;
        seen[label] = true;
        var conversion = { send_to: ads + '/' + label, transport_type: 'beacon' };
        if (typeof cfg.conversionValue === 'number') {
          conversion.value = cfg.conversionValue;
          conversion.currency = cfg.currency || 'AUD';
        }
        window.gtag('event', 'conversion', conversion);
      }
    } catch (err) { /* tracking must never break the page */ }
  }

  window.rsslTrack = track;

  function eventNameForLink(link) {
    if (!link || !link.getAttribute) return '';
    var explicit = link.getAttribute('data-track') || '';
    if (explicit === 'get_directions' || explicit === 'text_us' || explicit === 'contact') {
      return explicit === 'contact' ? 'text_us' : explicit;
    }
    var href = link.getAttribute('href') || '';
    if (/^sms:/i.test(href)) return 'text_us';
    if (/maps\.app\.goo\.gl|google\.com\/maps|maps\.google\.|goo\.gl\/maps/i.test(href)) return 'get_directions';
    return '';
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (event) {
      try {
        var target = event.target;
        var link = target && target.closest ? target.closest('a') : null;
        var name = eventNameForLink(link);
        if (!name) return;
        track(name, {
          link_url: link.href || link.getAttribute('href') || '',
          link_text: (link.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
        });
      } catch (err) { /* ignore */ }
    }, true);
  }

  function loadTag() {
    if (!ga4 && !ads) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      window.addEventListener('online', function onOnline() {
        window.removeEventListener('online', onOnline);
        loadTag();
      });
      return;
    }
    if (window.__rsslGtagStarted) return;
    window.__rsslGtagStarted = true;
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function () { window.dataLayer.push(arguments); };
    }
    window.gtag('js', new Date());
    if (ga4) window.gtag('config', ga4);
    if (ads) window.gtag('config', ads);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga4 || ads);
    script.onerror = function () {};
    (document.head || document.documentElement).appendChild(script);
  }

  try { loadTag(); } catch (err) { /* analytics must never break the page */ }
})();
