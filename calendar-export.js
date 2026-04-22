// calendar-export.js — ICS (RFC 5545) export of forfettario tax deadlines.
// Pure module: input = schedule rows, output = ICS text. No DOM, no localStorage.
(function (global) {
  'use strict';

  var CRLF = '\r\n';
  var PRODID = '-//Calcoli PIVA//Scadenze Fiscali//IT';
  var FIXED_DTSTAMP = '20260101T000000Z'; // byte-deterministic output

  function _escape(text) {
    if (text == null) return '';
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }
  function _foldLine(line) {
    function byteLen(s) {
      if (typeof Buffer !== 'undefined') return Buffer.byteLength(s, 'utf8');
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
      return s.length;
    }
    if (byteLen(line) <= 75) return line;
    var out = [];
    var buf = '';
    var first = true;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      var limit = first ? 75 : 74;
      if (byteLen(buf + ch) > limit) {
        out.push(first ? buf : ' ' + buf);
        buf = ch;
        first = false;
      } else {
        buf += ch;
      }
    }
    if (buf.length) out.push(first ? buf : ' ' + buf);
    return out.join('\r\n');
  }
  function _formatDate(iso) { throw new Error('not implemented'); }
  function _deterministicUid(profile, year, key) { throw new Error('not implemented'); }
  function _eventToVevent(ev) { throw new Error('not implemented'); }
  function buildIcsForYear(year, profile, scheduleRows) { throw new Error('not implemented'); }

  global.CalendarExport = {
    buildIcsForYear: buildIcsForYear,
    _escape: _escape,
    _foldLine: _foldLine,
    _formatDate: _formatDate,
    _deterministicUid: _deterministicUid,
    _eventToVevent: _eventToVevent,
    _FIXED_DTSTAMP: FIXED_DTSTAMP,
    _PRODID: PRODID
  };
})(typeof window !== 'undefined' ? window : globalThis);
