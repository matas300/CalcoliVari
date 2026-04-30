// app-shell.js — UI shell: sidebar drawer mobile + tab navigation + mobile nav labels
// Estratto da app.js per separare la navigation/layout dal core (SRP).
// Caricato DOPO app.js: usa S, currentProfile, currentYear, loadYearData,
// saveYearData, renderProfiloPersonale, renderProfiloPiva, renderRiepilogo
// come globali.

(function () {
  'use strict';

  // ─── Sidebar drawer (mobile) ─────────────────────────────────────────
  function toggleSidebar() {
    var el = document.getElementById('sidebar');
    if (!el) return;
    if (el.classList.contains('open')) closeSidebar();
    else openSidebar();
  }

  function openSidebar() {
    var el = document.getElementById('sidebar');
    var btn = document.getElementById('navToggle');
    if (!el) return;
    el.classList.add('open');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    if (window.matchMedia('(max-width: 768px)').matches) {
      document.body.style.overflow = 'hidden';
    }
  }

  function closeSidebar() {
    var el = document.getElementById('sidebar');
    var btn = document.getElementById('navToggle');
    if (!el) return;
    el.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  // ─── Sidebar collapse (desktop) ──────────────────────────────────────
  var SIDEBAR_COLLAPSED_KEY = 'calcoliPIVA_sidebarCollapsed';

  function applySidebarCollapsed(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', !!collapsed);
    var btn = document.querySelector('.sb-collapse-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.title = collapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale';
    }
  }

  function toggleSidebarCollapsed() {
    var next = !document.body.classList.contains('sidebar-collapsed');
    applySidebarCollapsed(next);
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function initSidebarCollapsed() {
    var stored = '0';
    try { stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) || '0'; } catch (e) { /* ignore */ }
    applySidebarCollapsed(stored === '1');
    // Mirror each sb-item label into data-tab-label so the collapsed-rail tooltip can show it
    document.querySelectorAll('.sb-item').forEach(function (btn) {
      var label = btn.querySelector('.sb-label');
      if (label && !btn.getAttribute('data-tab-label')) {
        btn.setAttribute('data-tab-label', label.textContent.trim());
      }
    });
  }
  document.addEventListener('DOMContentLoaded', initSidebarCollapsed);

  // ─── Tab navigation ──────────────────────────────────────────────────
  function switchToTab(tab) {
    document.querySelectorAll('.sb-item[data-tab]').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
    var navBtn = document.querySelector('.sb-item[data-tab="' + tab + '"]');
    if (navBtn) navBtn.classList.add('active');
    var tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.classList.add('active');
    try { localStorage.setItem('calcoliPIVA_activeTab', tab); } catch (_) { /* ignore */ }

    // Mount Dichiarazione wizard quando si passa a quel tab
    if (tab === 'dichiarazione' && window.DichiarazioneUI) {
      window.DichiarazioneUI.mount('tab-dichiarazione', currentYear);
    }

    // Render card A (fatture emesse) quando si passa a fatture
    if (tab === 'fatture') {
      // Migrazione legacy one-shot per-anno (unificazione store)
      if (window.FattureMigration && typeof window.FattureMigration.migrateLegacyYear === 'function') {
        try {
          for (var y = 2020; y <= new Date().getFullYear() + 1; y++) {
            var yd = loadYearData(y);
            if (yd && yd.fatture && !yd._fattureMigratedAt) {
              var res = window.FattureMigration.migrateLegacyYear(currentProfile, y, yd);
              if (res.migrated > 0) console.log('[fatture-migration] anno', y, '→', res.migrated, 'righe migrate');
              yd._fattureMigratedAt = new Date().toISOString();
              saveYearData(y, yd);
            }
          }
        } catch (err) { console.warn('[fatture-migration] errore', err); }
      }
      if (typeof window.renderFattureDocsSection === 'function') {
        window.renderFattureDocsSection();
      }
    }

    if (tab === 'profilo-personale') renderProfiloPersonale();
    else if (tab === 'profilo-piva') renderProfiloPiva();
    else if (tab === 'riepilogo') renderRiepilogo();

    // Chiudi drawer mobile dopo cambio tab
    if (window.matchMedia('(max-width: 768px)').matches) {
      closeSidebar();
    }
    window.scrollTo(0, 0);
  }

  function openDichiarazione() {
    switchToTab('dichiarazione');
  }

  // Click delegate sui pulsanti sidebar
  var sb = document.querySelector('.sidebar');
  if (sb) {
    sb.addEventListener('click', function (e) {
      var btn = e.target.closest('.sb-item[data-tab]');
      if (!btn) return;
      switchToTab(btn.dataset.tab);
    });
  } else {
    // Sidebar non ancora nel DOM al caricamento dello script: attendi DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
      var sb2 = document.querySelector('.sidebar');
      if (!sb2) return;
      sb2.addEventListener('click', function (e) {
        var btn = e.target.closest('.sb-item[data-tab]');
        if (!btn) return;
        switchToTab(btn.dataset.tab);
      });
    });
  }

  // ─── Mobile nav labels ───────────────────────────────────────────────
  var NAV_LABELS = {
    calcolo:        { full: null, short: 'Regime' }, // full set by applySettings
    accantonamento: { full: 'Tasse Accantonate', short: 'Tasse' },
    scadenziario:   { full: 'Scadenze', short: 'Scad.' },
    calendar:       { full: 'Calendario', short: 'Calend.' },
    fatture:        { full: 'Fatture', short: 'Fatture' },
    budget:         { full: 'Budget', short: 'Budget' },
    clienti:        { full: 'Clienti', short: 'Clienti' },
    spese:          { full: 'Spese', short: 'Spese' },
    dichiarazione:  { full: 'Dichiarazione', short: 'Dichiar.' },
    settings:       { full: 'Impostazioni', short: 'Impost.' }
  };

  function updateNavLabels() {
    document.querySelectorAll('.sb-item[data-tab]').forEach(function (btn) {
      var tab = btn.dataset.tab;
      var lbl = NAV_LABELS[tab];
      if (!lbl) return;
      var labelEl = btn.querySelector('.sb-label');
      if (!labelEl) return;
      if (tab === 'calcolo') {
        var regime = S().regime === 'forfettario' ? 'Forfettario' : 'Ordinario';
        labelEl.textContent = 'Regime ' + regime;
      } else {
        labelEl.textContent = lbl.full;
      }
    });
  }
  window.addEventListener('resize', updateNavLabels);

  // ─── Esposizione globale per backward compat ──────────────────────────
  if (typeof window !== 'undefined') {
    window.toggleSidebar = toggleSidebar;
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;
    window.applySidebarCollapsed = applySidebarCollapsed;
    window.toggleSidebarCollapsed = toggleSidebarCollapsed;
    window.initSidebarCollapsed = initSidebarCollapsed;
    window.switchToTab = switchToTab;
    window.openDichiarazione = openDichiarazione;
    window.updateNavLabels = updateNavLabels;
    window.NAV_LABELS = NAV_LABELS;
  }
})();
