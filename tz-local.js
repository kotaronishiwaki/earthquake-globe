/* tz-local.js — epicenter-local time helper.
   Looks up the IANA timezone for a lat/lon (via the tz-lookup database, loaded
   lazily from a CDN the first time it's needed) and formats a timestamp in that
   local zone with Intl (so DST is handled correctly). Used by the earthquake
   explanation overlay and the SNS mechanism cards to show the LOCAL time at the
   epicenter, with UTC kept as a small secondary label.

   The on-globe info card in index.html intentionally does NOT use this — it
   keeps showing each quake in the viewer's own device timezone.

   Exposes window.GlobeTZ:
     ready()                  -> Promise<boolean> resolved when tzlookup is loaded
     zoneOf(lat, lon)         -> IANA zone string, or null
     fmt(ms, locale, zone)    -> formatted datetime string, or null
     format(ms, lat, lon, loc)-> { local, utc, zone }  (local may be null) */
(function () {
  'use strict';
  // tz-lookup browser build — sets a global `tzlookup(lat, lon)`. ~71KB.
  var TZ_SRC = 'https://cdn.jsdelivr.net/npm/tz-lookup@6/tz.js';
  var loading = null;

  function load() {
    if (typeof window.tzlookup === 'function') return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = TZ_SRC;
      s.async = true;
      s.onload = function () { resolve(typeof window.tzlookup === 'function'); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function zoneOf(lat, lon) {
    if (typeof window.tzlookup !== 'function') return null;
    lat = Number(lat); lon = Number(lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    try { return window.tzlookup(lat, lon); } catch (e) { return null; }
  }

  function fmt(ms, locale, zone) {
    try {
      return new Intl.DateTimeFormat(locale || 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone
      }).format(new Date(ms));
    } catch (e) { return null; }
  }

  function format(ms, lat, lon, locale) {
    var zone = zoneOf(lat, lon);
    var utc = fmt(ms, locale, 'UTC');
    return {
      local: zone ? fmt(ms, locale, zone) : null,
      utc: utc ? (utc + ' UTC') : new Date(ms).toUTCString(),
      zone: zone
    };
  }

  window.GlobeTZ = { ready: load, zoneOf: zoneOf, fmt: fmt, format: format };

  // Start fetching the database right away so it's ready by the time a user
  // opens an explanation or a card.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
