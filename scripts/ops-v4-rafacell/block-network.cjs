// Loaded only by the isolated CI runner. A real WhatsApp/HTTP transport fails closed.
const allowed = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
const check = host => { if (!allowed(host)) throw new Error('RAFACELL_CI_EXTERNAL_HTTP_BLOCKED'); };
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  check(url.hostname);
  return originalFetch.call(this, input, init);
};
for (const name of ['node:http', 'node:https']) {
  const mod = require(name);
  for (const method of ['request', 'get']) {
    const original = mod[method];
    mod[method] = function (...args) {
      const first = args[0];
      const host = typeof first === 'string' || first instanceof URL
        ? new URL(first).hostname : first?.hostname ?? first?.host ?? 'localhost';
      check(String(host).replace(/:\d+$/, ''));
      return original.apply(this, args);
    };
  }
}
