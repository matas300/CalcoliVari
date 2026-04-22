// calendar-export.js — ICS (RFC 5545) export of forfettario tax deadlines.
// Pure module: input = schedule rows, output = ICS text. No DOM, no localStorage.
(function (global) {
  'use strict';

  var CRLF = '\r\n';
  var PRODID = '-//Calcoli PIVA//Scadenze Fiscali//IT';
  var FIXED_DTSTAMP = '20260101T000000Z'; // byte-deterministic output

  function _escape(text) { throw new Error('not implemented'); }
  function _foldLine(line) { throw new Error('not implemented'); }
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
