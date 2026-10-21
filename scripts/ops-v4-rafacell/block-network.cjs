// Runtime tests have loopback only. Build may fetch the two existing public font origins.
const allowed = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
function publicFontAllowed(url, method, headers, enabled) {
  if (!enabled || url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || method.toUpperCase() !== 'GET') return false;
  const font = (url.hostname === 'fonts.googleapis.com' && /^\/css2?$/.test(url.pathname)) ||
    (url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/s/'));
  const h = new Headers(headers);
  return font && !['authorization', 'proxy-authorization', 'cookie'].some(key => h.has(key));
}
const check = (url, method = 'GET', headers, auth) => {
  if (allowed(url.hostname)) return;
  if (!auth && publicFontAllowed(url, method, headers, process.env.OPS_V4_RAFACELL_PUBLIC_FONTS === '1')) return;
  throw new Error('RAFACELL_CI_EXTERNAL_HTTP_BLOCKED');
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  check(url, init?.method ?? input?.method ?? 'GET', init?.headers ?? input?.headers);
  return originalFetch.call(this, input, init);
};
for (const name of ['node:http', 'node:https']) {
  const mod = require(name);
  for (const method of ['request', 'get']) {
    const original = mod[method];
    mod[method] = function (...args) {
      const first = args[0];
      const isUrl = typeof first === 'string' || first instanceof URL;
      const options = isUrl ? (typeof args[1] === 'object' ? args[1] : {}) : first;
      const url = isUrl ? new URL(first) : new URL(`${options?.protocol ?? (name === 'node:https' ? 'https:' : 'http:')}//${options?.hostname ?? options?.host ?? 'localhost'}${options?.path ?? '/'}`);
      check(url, options?.method ?? 'GET', options?.headers, options?.auth);
      return original.apply(this, args);
    };
  }
}
module.exports = { publicFontAllowed };
