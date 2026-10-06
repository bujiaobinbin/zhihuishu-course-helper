const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/../extension/helper.js', 'utf8');
const begin = source.indexOf('      if (retry &&');
const end = source.indexOf('      if (list.every(done))', begin);
const logic = '(function(){' + source.slice(begin, end) + '})()';
function run(complete, priorRetry, path = '/course') {
  const events = [];
  const card = { title: 'uploaded.mp4', complete, querySelector: () => '78%' };
  const context = {
    retry: priorRetry, recheck: { path: '/course', title: card.title },
    location: { pathname: path }, list: [card], title: e => e.title,
    done: e => e.complete, text: e => e,
    RETRY_KEY: 'retry', sessionStorage: { setItem: (k, v) => events.push(['save', JSON.parse(v)]) },
    clearRetry() { context.retry = null; events.push(['clearRetry']); },
    clearRecheck() { context.recheck = null; },
    pause: s => events.push(['pause', s]), openCard: c => events.push(['open', c.title]),
    status: s => events.push(['status', s]), endedKey: 'old', endedSince: 1
  };
  vm.runInNewContext(logic, context);
  return { context, events };
}
const first = run(false, null);
assert(first.events.some(e => e[0] === 'open'));
assert(first.events.some(e => e[0] === 'save'));
assert(!first.events.some(e => e[0] === 'pause'));
assert.equal(first.context.endedKey, '');
const second = run(false, first.context.retry);
assert(second.events.some(e => e[0] === 'pause'));
assert(!second.events.some(e => e[0] === 'open'));
const completed = run(true, first.context.retry);
assert.equal(completed.context.retry, null);
assert(!completed.events.some(e => e[0] === 'pause' || e[0] === 'open'));
const otherPage = run(false, first.context.retry, '/other');
assert.equal(otherPage.context.retry, null);
assert(!otherPage.events.some(e => e[0] === 'open'));
console.log('PASS: first recovery, persistent retry limit, completed cleanup, page isolation');
