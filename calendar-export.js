// calendar-export.js — ICS (RFC 5545) export of forfettario tax deadlines.
// Pure module: input = schedule rows, output = ICS text. No DOM, no localStorage.
(function (global) {
  'use strict';

  var CRLF = '\r\n';
  var PRODID = '-//Calcoli PIVA//Scadenze Fiscali//IT';
  var FIXED_DTSTAMP = '20260101T000000Z'; // byte-deterministic output

  var VTIMEZONE = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Rome',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  ].join(CRLF);

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
  function _formatDate(iso) {
    var parts = String(iso).split('-');
    return parts[0] + parts[1] + parts[2] + 'T090000';
  }
  function _deterministicUid(profile, year, key) {
    var safeProfile = String(profile || 'default').toLowerCase().replace(/[^a-z0-9]/g, '');
    var safeKey = String(key).toLowerCase().replace(/[^a-z0-9_]/g, '');
    return 'calcolipiva-' + safeProfile + '-' + year + '-' + safeKey + '@calcoli-piva.local';
  }
  function _eventToVevent(ev) {
    var lines = [];
    lines.push('BEGIN:VEVENT');
    lines.push(_foldLine('UID:' + ev.uid));
    lines.push('DTSTAMP:' + FIXED_DTSTAMP);
    lines.push('DTSTART;TZID=Europe/Rome:' + ev.dtstart);
    lines.push('DTEND;TZID=Europe/Rome:' + ev.dtend);
    lines.push(_foldLine('SUMMARY:' + _escape(ev.summary)));
    if (ev.description) lines.push(_foldLine('DESCRIPTION:' + _escape(ev.description)));
    if (ev.location) lines.push(_foldLine('LOCATION:' + _escape(ev.location)));
    ['-P1M', '-P2W', '-P1W', '-P1D'].forEach(function (trig) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(_foldLine('DESCRIPTION:' + _escape(ev.summary)));
      lines.push('TRIGGER:' + trig);
      lines.push('END:VALARM');
    });
    lines.push('END:VEVENT');
    return lines.join(CRLF);
  }
  function _shouldSkipRow(row) {
    if (!row || !row.due || !row.due.iso) return true;
    if ((row.amount === 0 || row.amount == null) && /^bollo_/.test(row.key || '')) return true;
    return false;
  }

  function _addHour(dtstart) {
    // 'YYYYMMDDT090000' → 'YYYYMMDDT100000'. Events are 09:00→10:00 local.
    return dtstart.slice(0, 9) + '10' + dtstart.slice(11);
  }

  function buildIcsForYear(year, profile, scheduleRows) {
    var events = [];
    for (var i = 0; i < (scheduleRows || []).length; i++) {
      var row = scheduleRows[i];
      if (_shouldSkipRow(row)) continue;
      var dtstart = _formatDate(row.due.iso);
      events.push(_eventToVevent({
        uid: _deterministicUid(profile, year, row.key || ('row_' + i)),
        dtstart: dtstart,
        dtend: _addHour(dtstart),
        summary: row.title || 'Scadenza fiscale',
        description: '',
        location: 'F24'
      }));
    }
    var out = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:' + PRODID,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      VTIMEZONE
    ];
    for (var j = 0; j < events.length; j++) out.push(events[j]);
    out.push('END:VCALENDAR');
    return out.join(CRLF) + CRLF;
  }

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
