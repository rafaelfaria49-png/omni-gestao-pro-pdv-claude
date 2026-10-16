import { writeFileSync } from 'node:fs';

// Anonymous GET-only smoke. Never log response bodies or query customer data.
const [base, output, expectedBuild] = process.argv.slice(2);
if (!base || !output) throw new Error('Usage: node smoke-readonly.mjs BASE OUTPUT [EXPECTED_BUILD]');
const cases = [
  ['/api/version', 200], ['/privacy', 200], ['/client-privacy-cache.js', 200],
  ['/api/clientes', 401], ['/api/clients', 401], ['/api/clientes/duplicates', 401],
  ['/api/clientes/importar', 401],
  // POST-only surfaces reject GET. Their POST authorization is covered by unit regressions.
  ['/api/clientes/privacy-request', 405],
  ['/api/clientes/merge/plan', 405], ['/api/clientes/merge/execute', 405],
  ['/api/clientes/search', 405], ['/api/clientes/match-by-phone', 405],
];
const results = [];
for (const [path, expected] of cases) {
  try {
    const response = await fetch(new URL(path, base), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    const row = { path, method: 'GET', status: response.status, expected, pass: response.status === expected };
    if (path === '/api/version' && response.ok) {
      const body = await response.json();
      row.buildId = typeof body.buildId === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(body.buildId) ? body.buildId : 'INVALID';
      if (expectedBuild) row.pass &&= row.buildId === expectedBuild.slice(0, 12);
    } else if (path === '/privacy' && response.ok) {
      const body = await response.text();
      row.honestPolicy = body.includes('não atesta conformidade LGPD plena') && body.includes('retenção');
      row.pass &&= row.honestPolicy;
    } else if (path === '/client-privacy-cache.js' && response.ok) {
      const body = await response.text();
      row.cleanupPresent = body.includes('caches.keys') && body.includes('/api/clientes');
      row.pass &&= row.cleanupPresent;
    } else {
      await response.body?.cancel();
    }
    results.push(row);
  } catch {
    results.push({ path, method: 'GET', pass: false, error: 'REQUEST_FAILED' });
  }
}
const report = { observedAt: new Date().toISOString(), mode: 'ANONYMOUS_GET_ONLY', applicationWrites: 0, customerDataRead: false, result: results.every(r => r.pass) ? 'PASS' : 'FAIL', results };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (report.result !== 'PASS') process.exitCode = 1;
