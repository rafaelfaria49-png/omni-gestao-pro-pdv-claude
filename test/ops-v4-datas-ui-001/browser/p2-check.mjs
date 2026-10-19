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
const caseFilter = process.argv[4];
const require = createRequire(path.join(repo, 'package.json'));
const { createServer } = await import('vite');
const { chromium, expect } = require('@playwright/test');
const stubs = path.join(fixture, 'stubs.ts');
const actions = ['workspace', 'orcamento', 'status', 'prova-entrada', 'dados-basicos', 'producao', 'estoque', 'garantia', 'retorno', 'orcamento-envio', 'datas-correcao', 'entrega', 'pdv-servico'];
const server = await createServer({
  root: fixture, configFile: false, envFile: false, cacheDir: path.join(evidence, 'vite-cache'),
  resolve: { alias: [
    ...['next/link', 'next-auth/react', 'next/navigation', '@/hooks/useUserCredits', '@/hooks/use-sidebar-collapsed', '@/components/ia-mestre/ThemeSwitcher', '@/components/theme/LegibilityToggle', '@/components/painel-inicial/MobileNavSheet', '@/lib/loja-ativa', '@/app/actions/ordens', '@/app/actions/cadastros', '@/lib/operacoes-v4/financial-projection-actions', ...actions.map((a) => '@/lib/operacoes-v3/' + a + '-actions')].map((find) => ({ find, replacement: stubs })),
    { find: '@', replacement: repo },
  ] },
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' }, css: { postcss: { plugins: [] } },
  server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [fixture, repo, evidence] } },
});
let browser;
const result = { synthetic: true, noDatabase: true, sourceHashes: Object.fromEntries(['components/ui/command.tsx', 'components/painel-inicial/workspace-focus-context.tsx', 'components/operacoes-v4-preview/parts/CorrigirDatasModalV4.tsx', 'components/painel-inicial/Topbar.tsx', 'components/operacoes-v4-preview/parts/atendimento/AtendimentoModalShell.tsx', 'test/ops-v4-datas-ui-001/browser/fixture.tsx', 'test/ops-v4-datas-ui-001/browser/p2-check.mjs', 'test/ops-v4-datas-ui-001/browser/stubs.ts'].map((file) => [file, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex')])), sourceHead: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), errors: [], blockedRequests: [], cases: [] };
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
  let page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  const pageError = (e) => { result.errorCount = (result.errorCount || 0) + 1; if (!result.errors.includes(e.message)) result.errors.push(e.message); };
  page.on('pageerror', pageError);
  async function prepare() {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Selecionar OS A', exact: true }).click();
    await page.waitForFunction(() => window.__p2?.v.cargaEntradaEstabelecida);
    // Observa a instalação/limpeza sem substituir o comportamento dos eventos.
    await page.evaluate(() => {
      const listeners = new Map();
      const baseline = new Set();
      const add = document.addEventListener.bind(document);
      const remove = document.removeEventListener.bind(document);
      document.addEventListener = (type, listener, options) => {
        if (['keydown', 'focusin', 'focusout', 'pointerdown', 'dismissableLayer.update'].includes(type) && !baseline.has(listener)) listeners.set(listener, type);
        return add(type, listener, options);
      };
      document.removeEventListener = (type, listener, options) => { listeners.delete(listener); return remove(type, listener, options); };
      window.__p2Listeners = listeners;
      window.__p2BaselineListeners = baseline;
      const observers = new Set();
      const NativeObserver = window.MutationObserver;
      window.MutationObserver = class extends NativeObserver {
        observe(...args) { observers.add(this); return super.observe(...args); }
        disconnect() { observers.delete(this); return super.disconnect(); }
      };
      window.__p2Observers = observers;
    });
    // O Menu Radix persistente da Topbar registra handlePointer (once) no
    // primeiro teclado. Registra sua identidade no baseline ainda sem diálogo;
    // FocusScope, DismissableLayer e observadores da correção seguem rastreados.
    await page.keyboard.press('Shift');
    const baselineTypes = await page.evaluate(() => {
      const types = [...window.__p2Listeners.values()];
      for (const listener of window.__p2Listeners.keys()) window.__p2BaselineListeners.add(listener);
      window.__p2Listeners.clear();
      return types;
    });
    expect(baselineTypes).toEqual(['pointerdown']);
    result.listenerBaseline = { eventTypes: baselineTypes, establishedBeforeDialog: true };
  }
  const focus = async (step) => ({ step, ...await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, text: a?.textContent?.trim().slice(0, 60), disabled: Boolean(a?.disabled), inside: Boolean(document.querySelector('[role="dialog"]')?.contains(a)) };
  }) });
  async function runCase(name, fn) {
    if (caseFilter && !name.includes(caseFilter)) return;
    const item = { name, passed: false };
    result.cases.push(item);
    let timeout;
    try {
      await Promise.race([
        (async () => { await prepare(); await fn(item); item.passed = true; })(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('CASE_TIMEOUT: interação de foco não terminou em 25s')), 25000); }),
      ]);
    } catch (e) {
      item.error = String(e.stack || e);
      item.cleanupDiagnostic = await page.evaluate(() => ({
        listeners: [...(window.__p2Listeners ?? [])].map(([callback, type]) => ({ type, callback: String(callback).slice(0, 600) })),
        observers: window.__p2Observers?.size,
      })).catch(() => null);
    }
    finally { clearTimeout(timeout); }
    if (item.error?.includes('CASE_TIMEOUT')) {
      await Promise.race([page.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
      page = await context.newPage();
      page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
      page.on('pageerror', pageError);
    }
    console.log(JSON.stringify({ name, passed: item.passed, error: item.error?.split('\n')[0] }));
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
    await expect(acesso).toBeFocused();
    await page.waitForFunction(() => window.__p2Listeners.size === 0 && window.__p2Observers.size === 0);
    item.restored = await acesso.evaluate((el) => document.activeElement === el);
    item.listenersAfterClose = await page.evaluate(() => window.__p2Listeners.size);
    await page.getByRole('button', { name: 'Selecionar OS B', exact: true }).focus();
    item.externalFocusAfterClose = (await focus('after-close')).inside === false;
    expect(item.focus.every((sample) => sample.inside && !sample.disabled)).toBe(true);
    expect(item.restored).toBe(true); expect(item.listenersAfterClose).toBe(0); expect(item.externalFocusAfterClose).toBe(true);
  });
  await runCase('P2-1: sucesso encerra operação e limpa listeners/restaura foco', async (item) => {
    const acesso = page.getByRole('region', { name: 'Datas do atendimento' }).getByRole('button', { name: 'Corrigir datas', exact: true });
    const trigger = await acesso.elementHandle();
    await acesso.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Data de entrada do aparelho/).fill('2026-10-01');
    await dialog.getByPlaceholder(/Ex\.: o aparelho foi entregue/).fill('Verificar encerramento por sucesso');
    await dialog.getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await page.waitForFunction(() => window.__p2.qa.corrigir.length === 1);
    await page.evaluate(() => window.__p2.qa.corrigir.shift()({ ok: true, diff: [], garantia: null, os: {} }));
    await expect(dialog).toHaveCount(0);
    await page.waitForFunction(() => window.__p2.v.cargaEntradaEstabelecida);
    item.originalTrigger = await trigger.evaluate((el) => ({ connected: el.isConnected, disabled: el.disabled }));
    item.focusBeforeRestoreWait = await focus('after-success');
    await expect(acesso).toBeFocused();
    await page.waitForFunction(() => window.__p2Listeners.size === 0 && window.__p2Observers.size === 0);
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
  const correction = () => page.getByRole('dialog', { name: /^Corrigir datas/ });
  const palette = () => page.getByRole('dialog', { name: 'Buscar Rota ou Ação', exact: true });
  const competitor = () => page.getByRole('dialog', { name: 'Janela concorrente legítima', exact: true });
  const openCorrection = async () => {
    await page.getByRole('region', { name: 'Datas do atendimento' }).getByRole('button', { name: 'Corrigir datas', exact: true }).click();
    await expect(correction()).toBeVisible();
  };
  const startSave = async () => {
    await correction().getByLabel(/^Data de entrada do aparelho/).fill('2026-10-01');
    await correction().getByPlaceholder(/Ex\.: o aparelho foi entregue/).fill('Prova real de coordenação de overlays');
    await correction().getByRole('button', { name: 'Salvar correção', exact: true }).click();
    await expect(correction().getByRole('button', { name: 'Salvando…' })).toBeDisabled();
  };
  for (const busy of [false, true]) {
    await runCase('P2: Ctrl+K bloqueado na correção ' + (busy ? 'ocupada' : 'livre'), async (item) => {
      await openCorrection();
      if (busy) await startSave();
      await page.keyboard.press('Control+k');
      await expect(palette()).toHaveCount(0);
      await expect(correction()).toBeVisible();
      item.focus = [await focus('Ctrl+K')];
      expect(item.focus[0].inside).toBe(true);
    });
    await runCase('P2: overlay legítimo recebe foco/Escape sobre correção ' + (busy ? 'ocupada' : 'livre'), async (item) => {
      await openCorrection();
      if (busy) await startSave();
      await page.evaluate(() => window.__p2.setConcorrente(true));
      await expect(competitor().getByPlaceholder('Comando da janela legítima')).toBeFocused();
      // Mudar busy enquanto outra janela está ativa também não pode puxar foco.
      if (busy) {
        await page.evaluate(() => window.__p2.qa.corrigir.shift()({ ok: false, tipo: 'conflito', mensagem: 'Recusa sintética.' }));
        await expect(competitor().getByPlaceholder('Comando da janela legítima')).toBeFocused();
      }
      await page.keyboard.press('Tab');
      expect(await competitor().evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await competitor().evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(competitor()).toHaveCount(0);
      await expect(correction()).toBeVisible();
      await page.waitForFunction(() => document.querySelector('[data-og-v4-corrigir-datas]') && [...document.querySelectorAll('[role="dialog"]')].some((el) => el.textContent.includes('Corrigir datas') && el.contains(document.activeElement)));
      item.resumedFocus = true;
      item.onlyActiveClosed = true;
      await correction().getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(correction()).toHaveCount(0);
    });
  }
  await runCase('P2: paleta já ativa não perde foco nem Escape para correção solicitada', async (item) => {
    await page.keyboard.press('Control+k');
    await expect(palette().getByRole('combobox')).toBeFocused();
    await page.evaluate(() => window.__p2.v.openCorrigirDatas());
    await expect(palette().getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette()).toHaveCount(0);
    // O pedido pendente passa a ser a janela ativa quando a paleta termina.
    await expect(correction()).toBeVisible();
    item.deferred = true;
  });
  await runCase('P3: menu removido restaura foco à raiz estável da V4', async (item) => {
    await page.getByTitle('Mais ações', { exact: true }).click();
    await page.getByRole('button', { name: /📅.*Corrigir datas/ }).click();
    await expect(correction()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(correction()).toHaveCount(0);
    await expect(page.locator('[data-og-v4-raiz]')).toBeFocused();
    item.fallback = 'data-og-v4-raiz';
  });
  await runCase('P3: fechar correção sob outra janela não rouba foco', async (item) => {
    await openCorrection();
    await page.evaluate(() => window.__p2.setConcorrente(true));
    await expect(competitor()).toBeVisible();
    await page.evaluate(() => window.__p2.v.closeCorrigirDatas());
    await expect(correction()).toHaveCount(0);
    await expect(competitor().getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(competitor()).toHaveCount(0);
    item.preserved = true;
  });
  for (const change of ['OS', 'loja', 'unmount']) {
    await runCase('P3: desmontagem por ' + change + ' preserva destino novo e remove listeners', async (item) => {
      await openCorrection();
      await startSave();
      await page.evaluate((change) => {
        if (change === 'OS') window.__p2.v.selectOS(window.__p2.v.ordens.find((o) => o.id === 'b'), 'entrada');
        else if (change === 'loja') window.__p2.trocarLoja();
        else window.__p2.setVisivel(false);
      }, change);
      await expect(correction()).toHaveCount(0);
      const destination = page.getByRole('button', { name: 'Selecionar OS B', exact: true });
      await destination.focus();
      await page.evaluate(() => window.__p2.qa.corrigir.shift()({ ok: true, diff: [], garantia: null, os: {} }));
      await expect(destination).toBeFocused();
      await expect(correction()).toHaveCount(0);
      await page.waitForFunction(() => window.__p2Listeners.size === 0 && window.__p2Observers.size === 0);
      await page.keyboard.press('Control+k');
      await expect(palette().getByRole('combobox')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(palette()).toHaveCount(0);
      item.listeners = 0;
      item.lateReplyDidNotSteal = true;
    });
  }
  await runCase('Topbar: Ctrl+K normal, alternância e Escape fora da correção', async (item) => {
    await page.keyboard.press('Control+k');
    await expect(palette().getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(palette()).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await expect(palette().getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette()).toHaveCount(0);
    item.normal = true;
  });
  for (const change of ['OS', 'loja']) {
    await runCase('P2/P3: pedido pendente cancelado por ' + change + ' não deixa observador nem rouba foco', async (item) => {
      await page.keyboard.press('Control+k');
      await expect(palette().getByRole('combobox')).toBeFocused();
      await page.evaluate(() => window.__p2.v.openCorrigirDatas());
      await expect(palette().getByRole('combobox')).toBeFocused();
      await page.evaluate((change) => {
        if (change === 'OS') window.__p2.v.selectOS(window.__p2.v.ordens.find((o) => o.id === 'b'), 'entrada');
        else window.__p2.trocarLoja();
      }, change);
      await expect(palette().getByRole('combobox')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(palette()).toHaveCount(0);
      await expect(correction()).toHaveCount(0);
      await page.waitForFunction(() => window.__p2Listeners.size === 0 && window.__p2Observers.size === 0);
      item.listeners = 0; item.observers = 0;
    });
  }
  await runCase('P2/P3: viewport móvel mantém Tab/Shift+Tab e Escape ocupado', async (item) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCorrection(); await startSave();
    for (const key of [...Array(8).fill('Tab'), ...Array(8).fill('Shift+Tab')]) {
      await page.keyboard.press(key);
      expect(await correction().evaluate((el) => el.contains(document.activeElement) && !document.activeElement.disabled)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(correction()).toBeVisible();
    item.bounds = await correction().boundingBox();
    expect(item.bounds.x >= 0 && item.bounds.x + item.bounds.width <= 390).toBe(true);
    await page.screenshot({ path: path.join(evidence, label + '-mobile.png') });
  });
  for (const busy of [false, true]) {
    await runCase('P2: Escape consumido pelo diálogo preserva painel de fundo; ocupada=' + busy, async (item) => {
      await openCorrection();
      if (busy) await startSave();
      await page.evaluate(() => window.__p2Rails.openOverlay('os-context', 'workspace-right'));
      await page.waitForFunction(() => window.__p2Rails.overlayState.groups['workspace-right'].activeOverlay === 'os-context');
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => window.__p2Rails.overlayState.groups['workspace-right'].activeOverlay)).toBe('os-context');
      if (busy) {
        await expect(correction()).toBeVisible();
        await page.evaluate(() => window.__p2.qa.corrigir.shift()({ ok: false, tipo: 'conflito', mensagem: 'Recusa sintética.' }));
        await correction().getByRole('button', { name: 'Cancelar', exact: true }).click();
      }
      await expect(correction()).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__p2Rails.overlayState.groups['workspace-right'].activeOverlay === null);
      item.onlyActiveHandled = true; item.normalPanelEscape = true;
    });
  }
  expect(result.errors).toEqual([]); expect(result.blockedRequests).toEqual([]);
} catch (e) { result.fatal = String(e.stack || e); }
finally {
  if (browser) await browser.close(); await server.close();
  result.passed = !result.fatal && result.errors.length === 0 && (caseFilter ? result.cases.length > 0 : result.cases.length === 20) && result.cases.every((c) => c.passed);
  fs.writeFileSync(path.join(evidence, label + '-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, cases: result.cases.length, failures: result.cases.filter((c) => !c.passed).map((c) => ({ name: c.name, error: c.error?.split("\n")[0] })), errors: result.errors, errorCount: result.errorCount || 0, fatal: result.fatal?.split("\n")[0] }, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
