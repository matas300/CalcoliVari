'use strict';
var HU = require('../html-utils.js');

describe('HtmlUtils.escapeHtml', function () {
  test('caratteri base <script>', function () {
    expect(HU.escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
  test('apici doppi e singoli', function () {
    expect(HU.escapeHtml('a"b\'c')).toBe('a&quot;b&#39;c');
  });
  test('ampersand', function () {
    expect(HU.escapeHtml('a&b')).toBe('a&amp;b');
  });
  test('null → stringa vuota', function () { expect(HU.escapeHtml(null)).toBe(''); });
  test('undefined → stringa vuota', function () { expect(HU.escapeHtml(undefined)).toBe(''); });
  test('numero → stringa', function () { expect(HU.escapeHtml(42)).toBe('42'); });
  test('stringa vuota → stringa vuota', function () { expect(HU.escapeHtml('')).toBe(''); });
  test('XSS vector tutti insieme', function () {
    expect(HU.escapeHtml('<img src=x onerror="alert(1)">'))
      .toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});

describe('HtmlUtils.xmlEscape', function () {
  test('apici singoli usano &apos;', function () {
    expect(HU.xmlEscape("a'b")).toBe('a&apos;b');
  });
  test('caratteri base', function () {
    expect(HU.xmlEscape('<&>')).toBe('&lt;&amp;&gt;');
  });
  test('null → stringa vuota', function () { expect(HU.xmlEscape(null)).toBe(''); });
  test('undefined → stringa vuota', function () { expect(HU.xmlEscape(undefined)).toBe(''); });
  test('apici doppi', function () { expect(HU.xmlEscape('a"b')).toBe('a&quot;b'); });
});
