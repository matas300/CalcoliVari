// html-utils.js — Escape HTML/XML condivisi (DRY: consolidamento di 5 copie)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HtmlUtils = factory();
    if (typeof window !== 'undefined') window.HtmlUtils = root.HtmlUtils;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function xmlEscape(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  return { escapeHtml: escapeHtml, xmlEscape: xmlEscape };
}));
