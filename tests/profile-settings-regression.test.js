const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('riduzione35 is no longer synced globally from fiscal profile to yearly settings', () => {
  const syncFieldsMatch = appJs.match(/const PROFILE_SYNC_FIELDS = \[(.*?)\];/s);
  assert.ok(syncFieldsMatch, 'PROFILE_SYNC_FIELDS block not found');
  assert.equal(syncFieldsMatch[1].includes("'riduzione35'"), false);

  assert.match(appJs, /riduzione35:\s*0,\s*limiteForfettario/);
});

test('annual settings keep a dedicated 35% reduction control', () => {
  assert.match(indexHtml, /id="settRiduzione35"/);
  assert.match(indexHtml, /saveSetting\('riduzione35', this\.value\); recalcAll\(\)/);
});
