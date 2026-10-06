const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(__dirname + '/../extension/helper.js', 'utf8');
function boot(pathname, saved = {}) {
  const controls = Object.fromEntries(['start', 'pause', 'stop', 'status'].map(id => [id, {}]));
  const writes = [];
  const storage = { getItem: key => saved[key] || null, setItem: (key, value) => { saved[key] = value; writes.push([key, value]); }, removeItem: key => { delete saved[key]; } };
  const host = { style: {}, attachShadow: () => ({ querySelector: selector => controls[selector.slice(1)] }), remove() {} };
  const context = { location: { pathname }, document: { getElementById: () => null, createElement: () => host, documentElement: { append() {} }, querySelectorAll: () => [], querySelector: () => null, body: { innerText: '' } }, localStorage: storage, sessionStorage: storage, setInterval: () => 1, clearInterval() {}, Date, getComputedStyle: () => ({ visibility: 'visible' }) };
  vm.runInNewContext(source, context);
  return { controls, writes, saved };
}
test('different courses start inactive and keep separate enabled state', () => {
  const a = boot('/learnPage/101/202/303');
  assert.match(a.controls.status.textContent, /尚未开始/);
  a.controls.start.onclick();
  assert.equal(a.saved['course-helper:101:enabled'], 'yes');
  assert.match(boot('/learnPage/404/202/303', a.saved).controls.status.textContent, /尚未开始/);
  assert.match(boot('/learnPage/101/202/303', a.saved).controls.status.textContent, /等待/);
  a.controls.pause.onclick();
  assert.match(boot('/learnPage/101/202/303', a.saved).controls.status.textContent, /尚未开始/);
});
test('non-course pages do not mount assistant', () => {
  assert.equal(boot('/home').controls.status.textContent, undefined);
});
test('catalog derives course and class IDs and waits for stable directory', () => {
  const prefix = source.slice(0, source.indexOf('  const host ='));
  const helpers = source.slice(source.indexOf('  const pointId ='), source.indexOf('  const currentKey ='));
  const navigation = source.slice(source.indexOf('  function nextPoint()'), source.indexOf('  function tick()'));
  let now = 10000;
  const clicks = [];
  const cards = [100, 25, 0].map((progress, i) => ({ getAttribute: () => String(i + 1), querySelector: selector => ({ textContent: selector === '.progress-num' ? progress + '%' : 'point' + i }), click: () => clicks.push(i) }));
  const context = { location: { pathname: '/singleCourse/knowledgeStudy/101/303' }, document: { getElementById: () => null, querySelectorAll: selector => selector.includes('knowledgeid') ? cards : [] }, sessionStorage: { getItem: () => null, setItem() {} }, text: e => e.textContent, visible: () => true, status() {}, pause() {}, Date: { now: () => now }, loadingSince: now, catalogPending: null };
  vm.runInNewContext(prefix + helpers + navigation + '\n globalThis.visit = visitCatalog; globalThis.catalog = CATALOG; })();', context);
  assert.equal(context.catalog, '/singleCourse/knowledgeStudy/101/303');
  context.visit();
  assert.equal(clicks.length, 0);
  now += 3100;
  context.visit();
  assert.deepEqual(clicks, [1]);
});
