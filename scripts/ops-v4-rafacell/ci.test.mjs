import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDisposableDatabase, compareFailures, inspectCoverage, resolveComparisonBase } from './ci.mjs';
import { publicFontAllowed } from './block-network.cjs';

const url = 'postgresql://rafacell_ci:synthetic@127.0.0.1:5432/ops_v4_prepub003_c100900001?schema=public';
const env = { OPS_V4_RAFACELL_DISPOSABLE: '1', DATABASE_URL: url, DIRECT_URL: url, OPS_V4_PREPUBLISH_TEST_DATABASE_URL: url };
test('PostgreSQL guard accepts only the explicit exclusive loopback database', () => {
  assert.equal(assertDisposableDatabase(env), url);
  for (const change of [
    { OPS_V4_RAFACELL_DISPOSABLE: '0' }, { DIRECT_URL: url + '&other=1' },
    ...['db.neon.tech', 'localhost', '127.0.0.1.evil.test'].map(host => {
      const bad = url.replace('127.0.0.1', host);
      return { DATABASE_URL: bad, DIRECT_URL: bad, OPS_V4_PREPUBLISH_TEST_DATABASE_URL: bad };
    }),
    ...[url.replace('ops_v4_prepub003_c100900001', 'postgres'), url + '&host=db.neon.tech', url.replace('rafacell_ci:', 'postgres:'), url.replace(':5432/', ':1/')].map(bad => ({ DATABASE_URL: bad, DIRECT_URL: bad, OPS_V4_PREPUBLISH_TEST_DATABASE_URL: bad })),
  ]) assert.throws(() => assertDisposableDatabase({ ...env, ...change }), /RAFACELL_CI_/);
});
test('regression comparison uses file AND complete assertion name, retaining all failures', () => {
  const historical = { file: 'old.test.ts', name: 'suite shared name' };
  const otherFile = { file: 'new.test.ts', name: historical.name };
  const newAssertion = { file: historical.file, name: 'suite new failure' };
  const resolved = { file: 'resolved.test.ts', name: 'suite resolved' };
  assert.deepEqual(compareFailures([historical, resolved], [historical, otherFile, newAssertion]), {
    historical: [historical], newFailures: [otherFile, newAssertion], resolved: [resolved],
  });
});
test('a skipped or removed historical assertion is never reported as resolved', () => {
  const old = { file: 'history.test.ts', name: 'known failure', status: 'failed' };
  for (const head of [[], [{ ...old, status: 'pending' }], [{ ...old, status: 'todo' }]]) {
    assert.deepEqual(inspectCoverage([old], head), { resolved: [], removedOrSkipped: [old] });
  }
  assert.deepEqual(inspectCoverage([old], [{ ...old, status: 'passed' }]), {
    resolved: [{ file: old.file, name: old.name }], removedOrSkipped: [],
  });
  assert.deepEqual(inspectCoverage([old], [{ ...old, status: 'passed' }, old]), { resolved: [], removedOrSkipped: [] });
});
test('only credential-free public font GETs are permitted, and only in the build', () => {
  const css = new URL('https://fonts.googleapis.com/css2?family=Inter');
  const font = new URL('https://fonts.gstatic.com/s/inter/public.woff2');
  assert.equal(publicFontAllowed(css, 'GET', {}, true), true);
  assert.equal(publicFontAllowed(font, 'GET', {}, true), true);
  assert.equal(publicFontAllowed(css, 'GET', {}, false), false);
  for (const bad of ['https://graph.facebook.com/messages', 'https://fonts.googleapis.com.evil.test/css2', 'http://fonts.googleapis.com/css2', 'https://fonts.googleapis.com/not-a-font', 'https://user:password@fonts.googleapis.com/css2']) {
    assert.equal(publicFontAllowed(new URL(bad), 'GET', {}, true), false);
  }
  assert.equal(publicFontAllowed(css, 'POST', {}, true), false);
  assert.equal(publicFontAllowed(css, 'GET', { Authorization: 'synthetic' }, true), false);
  assert.equal(publicFontAllowed(font, 'GET', { Cookie: 'synthetic' }, true), false);
});
test('comparison resolves fetched main, without trusting an outdated PR event base', () => {
  const current = 'a874342f5366427f8f7cfebc96a9c14c8efe39ad';
  const refs = [];
  assert.equal(resolveComparisonBase('origin/main', ref => { refs.push(ref); return current; }), current);
  assert.deepEqual(refs, ['refs/remotes/origin/main']);
  assert.equal(resolveComparisonBase(current, () => { throw new Error('must not resolve explicit SHA'); }), current);
  for (const invalid of [undefined, 'main', 'origin/other', 'invalid-sha']) assert.throws(() => resolveComparisonBase(invalid, () => current), /EXPLICIT_BASE_SHA/);
  assert.throws(() => resolveComparisonBase('origin/main', () => ''), /EXPLICIT_BASE_SHA/);
});
