// app-context.js — Risoluzione singleton readonly per profilo/anno/settings
// Risolve DUP-4 (resolveProfile pattern ripetuto) + DUP-8 (try/catch getSettings)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppContext = factory();
    if (typeof window !== 'undefined') window.AppContext = root.AppContext;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getProfile() {
    if (typeof window !== 'undefined') {
      // Priorità 1: window.getProfile() se disponibile
      if (typeof window.getProfile === 'function') {
        try {
          var p = window.getProfile();
          if (typeof p === 'string' && p) return p;
        } catch (_) { /* fallthrough */ }
      }
      // Priorità 2: window.currentProfile diretta
      if (typeof window.currentProfile === 'string' && window.currentProfile) {
        return window.currentProfile;
      }
    }
    // Priorità 3: sessionStorage
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem) {
      try {
        var s = sessionStorage.getItem('calcoliPIVA_profile');
        if (s) return s;
      } catch (_) { /* fallthrough */ }
    }
    return null;
  }

  function getYear() {
    if (typeof window !== 'undefined') {
      if (typeof window.currentYear === 'number' && Number.isFinite(window.currentYear)) {
        return window.currentYear;
      }
      if (typeof window.getCurrentYear === 'function') {
        try {
          var y = window.getCurrentYear();
          if (typeof y === 'number' && Number.isFinite(y)) return y;
        } catch (_) { /* fallthrough */ }
      }
    }
    return new Date().getFullYear();
  }

  function getSettings() {
    if (typeof window === 'undefined') return {};
    try {
      if (typeof window.getSettings === 'function') {
        var s = window.getSettings();
        if (s && typeof s === 'object') return s;
      }
    } catch (_) { /* fallthrough */ }
    return {};
  }

  return { getProfile: getProfile, getYear: getYear, getSettings: getSettings };
}));
