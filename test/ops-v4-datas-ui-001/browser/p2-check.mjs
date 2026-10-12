// node test/ops-v4-datas-ui-001/browser/p2-check.mjs <evidence-dir> <label>
// Requer Edge instalado. Usa clique/teclado nativos, componentes e hook reais;
// sessão, loja e actions são sintéticas. Nenhuma requisição externa é permitida.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const fixture = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(fixture, '../../..');
const evidence = path.resolve(process.argv[2]);
const label = process.argv[3] || 'browser-p2';
const require = createRequire(path.join(repo, 'package.json'));
const { createServer } = await import('vite');
const { chromium, expect } = require('@playwright/test');
const stubs = path.join(fixture, 'stubs.ts');
const actions = ['workspace', 'orcamento', 'status', 'prova-entrada', 'dados-basicos', 'producao', 'estoque', 'garantia', 'retorno', 'orcamento-envio', 'datas-correcao', 'entrega', 'pdv-servico'];
const server = await createServer({
  root: fixture, configFile: false, envFile: false, cacheDir: path.join(evidence, 'vite-cache'),
  resolve: { alias: [
    ...['next-auth/react', 'next/navigation', '@/lib/loja-ativa', '@/app/actions/ordens', '@/app/actions/cadastros', '@/lib/operacoes-v4/financial-projection-actions', ...actions.map((a) => '@/lib/operacoes-v3/' + a + '-actions')].map((find) => ({ find, replacement: stubs })),
    { find: '@', replacement: repo },
  ] },
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' }, css: { postcss: { plugins: [] } },
  server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [fixture, repo, evidence] } },
});
let browser;
const result = { synthetic: true, noDatabase: true, sourceHead: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), errors: [], blockedRequests: [], cases: [] };
try {
  await server.listen();
  const url = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-networking'] });
  result.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === url) return route.continue();
    result.blockedRequests.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => result.errors.push(e.message));
  async function prepare() {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Selecionar OS A', exact: true }).click();
    await page.waitForFunction(() => window.__p2?.v.cargaEntradaEstabelecida);
    // Observa a instalação/limpeza sem substituir o comportamento dos eventos.
    await page.evaluate(() => {
      const listeners = new Map();
      const add = document.addEventListener.bind(document);
      const remove = document.removeEventListener.bind(document);
      document.addEventListener = (type, listener, options) => {
        if (['keydown', 'focusin'].includes(type)) listeners.set(listener, type);
        return add(type, listener, options);
      };
      document.removeEventListener = (type, listener, options) => { listeners.delete(listener); return remove(type, listener, options); };
      window.__p2Listeners = listeners;
    });
  }
  const focus = async (step) => ({ step, ...await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, text: a?.textContent?.trim().slice(0, 60), disabled: Boolean(a?.disabled), inside: Boolean(document.querySelector('[role="dialog"]')?.contains(a)) };
  }) });
  async function runCase(name, fn) {
    const item = { name, passed: false };
    result.cases.push(item);
    try { await prepare(); await fn(item); item.passed = true; }
    catch (e) { item.error = String(e.stack || e); }
  }
  await runCase('P2-1: clique real, busy, Tab/Shift+Tab, Escape, recusa e restauração', async (item) => {
    const acesso = page.getByRole('region', { name: 'Datas do atendimento' }).getByRole('button', { name: 'Corrigir datas', exact: true });
    await acesso.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Data de entrada do aparelho/).fill('2026-10-01');
    await dialog.getByPlaceholder(/Ex\.: o aparelho foi entregue/).fill('Verificação nativa de foco durante busy');
    await dialog.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
    await page.waitForFunction(() => window.__p2.qa.corrigir.length === 1);
    item.focus = [await focus('after-native-click')];
    for (const key of [...Array(12).fill('Tab'), ...Array(12).fill('Shift+Tab')]) {
      await page.keyboard.press(key); item.focus.push(await focus(key));
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(1);
    await page.screenshot({ path: path.join(evidence, label + '-busy.png') });
    // Completa a mesma operação antes de avaliar o resultado, inclusive no vermelho.
    await page.evaluate(() => window.__p2.qa.corrigir.shift()({ ok: false, tipo: 'conflito', mensagem: 'Recusa sintética; nada gravado.' }));
    await expect(dialog.getByRole('button', { name: 'Salvar correção', exact: true })).toBeEnabled();
    await expect(dialog.getByPlaceholder(/Ex\.: o aparelho foi entregue/)).toHaveValue('Verificação nativa de foco durante busy');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    item.restored = await acesso.evaluate((el) => document.activeElement === el);
    item.listenersAfterClose = await page.evaluate(() => window.__p2Listeners.size);
    await page.getByRole('button', { name: 'Selecionar OS B', exact: true }).focus();
    item.externalFocusAfterClose = (await focus('after-close')).inside === false;
    expect(item.focus.every((sample) => sample.inside && !sample.disabled)).toBe(true);
    expect(item.restored).toBe(true); expect(item.listenersAfterClose).toBe(0); expect(item.externalFocusAfterClose).toBe(true);
  });
  await runCase('P2-1: sucesso encerra operação e limpa listeners/restaura foco', async (item) => {
    const acesso = page.getByRole('region', { name: 'Datas do atendimento' }).getByRole('button', { name: 'Corrigir datas', exact: true });
    await acesso.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Data de entrada do aparelho/).fill('2026-10-01');
    await dialog.getByPlaceholder(/Ex\.: o aparelho foi entregue/).fill('Verificar encerramento por sucesso');
    await dialog.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await page.waitForFunction(() => window.__p2.qa.corrigir.length === 1);
    await page.evaluate(() => window.__p2.qa.corrigir.shift()({ ok: true, diff: [], garantia: null, os: {} }));
    await expect(dialog).toHaveCount(0);
    await page.waitForFunction(() => window.__p2.v.cargaEntradaEstabelecida);
    item.restored = await acesso.evaluate((el) => document.activeElement === el);
    item.listeners = await page.evaluate(() => window.__p2Listeners.size);
    expect(item.restored).toBe(true); expect(item.listeners).toBe(0);
  });
  await runCase('P2-2: Segurança sem sujeira bloqueia acesso visível, comando e menu real', async (item) => {
    await page.getByRole('button', { name: /Segurança/ }).click();
    await page.getByRole('button', { name: 'Registrar: nenhum acessório recebido', exact: true }).click();
    await page.waitForFunction(() => window.__p2.qa.entrada.length === 1);
    const acesso = page.getByRole('region', { name: 'Datas do atendimento' }).getByRole('button', { name: 'Corrigir datas', exact: true });
    await expect(acesso).toBeDisabled();
    item.clean = await page.evaluate(() => !window.__p2.v.rascunhos.sujo('loja-qa-datas::a'));
    await page.getByTitle('Mais ações', { exact: true }).click();
    await page.getByRole('button', { name: /📅.*Corrigir datas/ }).click();
    item.openedByMenu = await page.getByRole('dialog').count() > 0;
    if (item.openedByMenu) await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await page.evaluate(() => window.__p2.v.openCorrigirDatas());
    item.openedByCommand = await page.getByRole('dialog').count() > 0;
    if (item.openedByCommand) await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await page.screenshot({ path: path.join(evidence, label + '-menu.png') });
    await page.evaluate(() => window.__p2.qa.entrada.shift()());
    await expect(acesso).toBeEnabled();
    await page.getByTitle('Mais ações', { exact: true }).click();
    await page.getByRole('button', { name: /📅.*Corrigir datas/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    item.reopenedAfterCompletion = true;
    expect(item.clean).toBe(true); expect(item.openedByMenu).toBe(false); expect(item.openedByCommand).toBe(false);
  });
  await runCase('P2-1: troca de contexto desmonta a janela e limpa listeners', async (item) => {
    await page.getByRole('region', { name: 'Datas do atendimento' }).getByRole('button', { name: 'Corrigir datas', exact: true }).click();
    await page.evaluate(() => window.__p2.v.selectOS(window.__p2.v.ordens.find((o) => o.id === 'b'), 'entrada'));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    item.listeners = await page.evaluate(() => window.__p2Listeners.size);
    await page.getByRole('button', { name: 'Selecionar OS A', exact: true }).focus();
    expect(item.listeners).toBe(0);
    expect((await focus('after-unmount')).inside).toBe(false);
  });
  expect(result.errors).toEqual([]); expect(result.blockedRequests).toEqual([]);
} catch (e) { result.fatal = String(e.stack || e); }
finally {
  if (browser) await browser.close(); await server.close();
  result.passed = !result.fatal && result.errors.length === 0 && result.cases.length === 4 && result.cases.every((c) => c.passed);
  fs.writeFileSync(path.join(evidence, label + '-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
