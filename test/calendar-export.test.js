// Minimal assert runner (no framework dep).
var assert = require('assert');
// Force the IIFE to attach to our shim by declaring `window` as a global before require.
global.window = {};
require('../calendar-export.js');
var CE = global.window.CalendarExport;

// _escape
assert.strictEqual(CE._escape('a;b'), 'a\\;b');
assert.strictEqual(CE._escape('a,b'), 'a\\,b');
assert.strictEqual(CE._escape('a\\b'), 'a\\\\b');
assert.strictEqual(CE._escape('a\nb'), 'a\\nb');
assert.strictEqual(CE._escape('plain'), 'plain');

// _foldLine: <=75 octets untouched
assert.strictEqual(CE._foldLine('SHORT:hello'), 'SHORT:hello');
// _foldLine: long line split on 75 octets with CRLF + SPACE continuation
var long = 'SUMMARY:' + new Array(100).join('x'); // 108 chars
var folded = CE._foldLine(long);
assert.ok(folded.indexOf('\r\n ') > 0, 'expected CRLF+SPACE fold');
// Each physical line segment must be <=75 octets
folded.split('\r\n').forEach(function (seg, i) {
  var body = i === 0 ? seg : seg.slice(1); // drop leading space on continuations
  assert.ok(Buffer.byteLength(i === 0 ? seg : ' ' + body, 'utf8') <= 75, 'segment too long');
});

// _formatDate: YYYY-MM-DD at 09:00 local → YYYYMMDDT090000
assert.strictEqual(CE._formatDate('2026-06-30'), '20260630T090000');
assert.strictEqual(CE._formatDate('2026-01-05'), '20260105T090000');

// _deterministicUid: stable per profile+year+key
var u1 = CE._deterministicUid('Mattia', 2026, 'imposta_saldo_2025');
var u2 = CE._deterministicUid('Mattia', 2026, 'imposta_saldo_2025');
assert.strictEqual(u1, u2, 'UID must be deterministic');
assert.ok(/@calcoli-piva\.local$/.test(u1), 'UID must end with @calcoli-piva.local');
assert.notStrictEqual(CE._deterministicUid('Peru', 2026, 'imposta_saldo_2025'), u1);

var ev = {
  uid: 'test-uid@calcoli-piva.local',
  dtstart: '20260630T090000',
  dtend: '20260630T100000',
  summary: 'Saldo imposta sostitutiva 2025',
  description: 'Scadenza fiscale — codice tributo 1792',
  location: 'F24'
};
var vevent = CE._eventToVevent(ev);
assert.ok(vevent.indexOf('BEGIN:VEVENT') === 0);
assert.ok(vevent.indexOf('END:VEVENT') > 0);
assert.ok(vevent.indexOf('UID:test-uid@calcoli-piva.local') > 0);
assert.ok(vevent.indexOf('DTSTART;TZID=Europe/Rome:20260630T090000') > 0);
assert.ok(vevent.indexOf('DTEND;TZID=Europe/Rome:20260630T100000') > 0);
assert.ok(vevent.indexOf('DTSTAMP:' + CE._FIXED_DTSTAMP) > 0);
assert.ok(vevent.indexOf('SUMMARY:Saldo imposta sostitutiva 2025') > 0);
assert.strictEqual((vevent.match(/BEGIN:VALARM/g) || []).length, 4);
assert.ok(vevent.indexOf('TRIGGER:-P1M') > 0);
assert.ok(vevent.indexOf('TRIGGER:-P2W') > 0);
assert.ok(vevent.indexOf('TRIGGER:-P1W') > 0);
assert.ok(vevent.indexOf('TRIGGER:-P1D') > 0);
assert.ok(vevent.indexOf('\r\n') > 0);

var rows = [
  { key: 'imposta_saldo_2025', title: 'Saldo imposta sostitutiva 2025', due: { iso: '2026-06-30' }, amount: 1200, status: 'open' },
  { key: 'imposta_acc2_2026', title: 'Secondo acconto imposta 2026', due: { iso: '2026-11-30' }, amount: 800, status: 'open' },
  { key: 'bollo_q1_2026',     title: 'Bollo 1° trimestre',            due: { iso: '2026-05-31' }, amount: 0,    status: 'open' },
  { key: 'imposta_acc1_2026', title: 'Primo acconto imposta 2026',    due: { iso: '2026-06-30' }, amount: 500, status: 'paid' },
  { key: 'inps_fissi_2_2026', title: 'INPS fissi — 2° rata 2026',     due: { iso: null },         amount: 900, status: 'open' }
];

var ics = CE.buildIcsForYear(2026, 'Mattia', rows);
assert.ok(ics.indexOf('BEGIN:VCALENDAR') === 0);
assert.ok(ics.indexOf('VERSION:2.0') > 0);
assert.ok(ics.indexOf('PRODID:' + CE._PRODID) > 0);
assert.ok(ics.indexOf('BEGIN:VTIMEZONE') > 0);
assert.ok(ics.indexOf('TZID:Europe/Rome') > 0);
assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
assert.ok(ics.indexOf('Saldo imposta sostitutiva 2025') > 0);
assert.ok(ics.indexOf('Secondo acconto imposta 2026') > 0);
assert.ok(/END:VCALENDAR\r\n?$/.test(ics));

var ics2 = CE.buildIcsForYear(2026, 'Mattia', rows);
assert.strictEqual(ics, ics2, 'buildIcsForYear must be byte-deterministic');

console.log('Tasks 2+3+4+5 tests passed');
