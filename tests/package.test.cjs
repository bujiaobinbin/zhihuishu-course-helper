const fs = require('node:fs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
test('installable MV3 package has only course-page access and no personal bindings', () => {
  const root = __dirname + '/../';
  const manifest = JSON.parse(fs.readFileSync(root + 'extension/manifest.json', 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://ai-smart-course-student-pro.zhihuishu.com/*']);
  for (const file of manifest.content_scripts[0].js) assert(fs.existsSync(root + 'extension/' + file));
  const source = fs.readFileSync(root + 'extension/helper.js', 'utf8');
  assert(!/2095353149315678208|284987|EXPECTED_POINTS|C:\\Users|E:\\Codex/.test(source));
  assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|chrome\.cookies/.test(source));
});
