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

console.log('Task 2 tests passed');
