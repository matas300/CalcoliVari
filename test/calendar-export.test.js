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

console.log('Tasks 2+3 tests passed');
