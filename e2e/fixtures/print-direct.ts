/** OMNI-PRINT-004C Playwright fixture. Serves the REAL PdvClassic bundle (with the real direct-print feedback,
 * client and availability hook). Only I/O/provider boundaries are stubbed. No Next server, .env or commercial DB:
 * the spec routes /api/print/direct/** to the real handlers over a disposable PostgreSQL (print_lab_*). */
import { createServer } from "node:http"
import { resolve } from "node:path"

export const ORIGIN = "http://127.0.0.1:4181"
export const STORE = "p004c-loja-a"
export const TERMINAL = { id: "p004c-term-a1", code: "PDV1", name: "Caixa 1" }
export const OPS_KEY = `assistec-pro-ops-v1-${STORE}`

export function seedStorage(storage: Pick<Storage, "setItem">) {
  storage.setItem(OPS_KEY, JSON.stringify({ inventory: [], ordens: [], sales: [], devolucoes: [],
    caixa: { isOpen: true, saldoInicial: 100, dataAbertura: new Date().toISOString(), totalEntradas: 0, totalSaidas: 0 }, caixaSessaoId: "p004c-caixa", customerCredits: {} }))
  storage.setItem(`@omnigestao:pdv-terminal:${STORE}`, JSON.stringify(TERMINAL))
}

async function serve() {
  const { build } = await import("esbuild")
  const root = process.cwd()
  const stubs: Record<string, string> = {
    "lib/loja-ativa.tsx": `export const OPS_KEY_LEGACY='assistec-pro-ops-v1'; export function useLojaAtiva(){return {lojaAtivaId:'${STORE}',opsStorageKey:'${OPS_KEY}',empresaDocumentos:{nomeFantasia:'Loja Sintética A'},getEnderecoDocumentos:()=>''}}`,
    "lib/store-settings-provider.tsx": `import {defaultFormasPagamento} from '@/lib/pdv-formas-pagamento'; import {defaultPdvImpressaoConfig} from '@/lib/pdv-impressao-config';
      const params={formasPagamento:defaultFormasPagamento(),atalhosRapidos:[],incluirImpostoEstimadoNoPdv:false,aliquotaImpostoEstimadoPdv:0};
      const impressaoConfig={...defaultPdvImpressaoConfig(),...(window.__printCfg||{})};
      export function useStoreSettings(){return {pdvParams:params,blob:{pdvParams:params},settings:{},hydrated:true,loaded:true,pdvScaleVisorVisible:false,storeId:'${STORE}',impressaoConfig,save:()=>{}}}`,
    "lib/config-empresa.tsx": `import {configPadrao} from '${resolve(root, "lib/config-empresa.tsx").replaceAll("\\", "/")}?actual';export function useConfigEmpresa(){return {config:configPadrao}};export {configPadrao}`,
    "components/theme/ThemeProvider.tsx": `export const useStudioTheme=()=>({mode:'classic'})`,
    "lib/pdv-operador-nome.ts": `export const usePdvOperadorNome=()=> 'Operadora Sintética'`,
    "lib/pdv-operator-id.ts": `export const getOrCreatePdvOperatorId=()=> 'p004c-operator'`,
    "components/dashboard/caixa/caixa-provider.tsx": `import {useOperationsStore} from '@/lib/operations-store';export function useCaixa(){const s=useOperationsStore();return {caixa:s.caixa,sessaoId:'p004c-caixa'}}`,
    "components/dashboard/caixa/use-atualizar-caixa.ts": `export const useGarantirSessaoCaixa=()=>({garantirSessao:async()=>true})`,
    "components/dashboard/caixa/caixa-status-bar.tsx": `export const CaixaStatusBar=()=>null`,
    "lib/automation/automation-engine.ts": `export const initAutomationEngineClient=()=>{}`,
    "app/actions/vendas-enterprise.ts": `export async function enrichVendaEnterprise(data){return fetch('/__fixture/enrich',{method:'POST',body:JSON.stringify(data)}).then(r=>r.json())}`,
    "components/dashboard/vendas/trocas-devolucao.tsx": `export const TrocasDevolucao=()=>null`,
    "components/dashboard/vendas/pdv-recebimento-modal.tsx": `export const PdvRecebimentoModal=()=>null`,
    "components/dashboard/vendas/acessorios/selecionar-acessorio-dialog.tsx": `export const SelecionarAcessorioDialog=()=>null`,
    "components/dashboard/vendas/cupom-nao-fiscal.tsx": `export const CupomNaoFiscal=()=>null`,
    // Default: observe the legacy path. Routing regressions opt in to the REAL feedback/runtime with simulated HTTP I/O.
    "components/dashboard/vendas/pdv-auto-print-feedback.tsx": `import {PdvAutoPrintFeedback as Actual} from '${resolve(root, "components/dashboard/vendas/pdv-auto-print-feedback.tsx").replaceAll("\\", "/")}?actual';
      export const PdvAutoPrintFeedback=(p)=>{if(window.__printCfg.realLegacyFeedback)return <Actual {...p}/>;if(p.printInput&&!window.__legacy.seen.has(p.printInput)){window.__legacy.seen.add(p.printInput);window.__legacy.auto++}return null}`,
    "components/dashboard/vendas/pdv-post-sale-dialog.tsx": `export const PdvPostSaleDialog=(p)=>{if(p.open&&p.printInput&&!window.__legacy.seen.has(p.printInput)){window.__legacy.seen.add(p.printInput);window.__legacy.dialog++}return null}`,
  }
  const names: Record<string, string> = {
    "next/navigation": `export const useRouter=()=>({push:()=>{},replace:()=>{}})`,
    "next-auth/react": `export const useSession=()=>({data:null})`,
  }
  const entry = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {OperationsProvider,useOperationsStore} from '@/lib/operations-store';
    import {PdvClassic} from '@/components/dashboard/vendas/pdv-classic';
    window.__legacy={auto:0,dialog:0,seen:new WeakSet()};
    function App(){const ops=useOperationsStore();window.__ops=ops;return <PdvClassic/>}
    createRoot(document.getElementById('root')).render(<OperationsProvider storageKey='${OPS_KEY}'><App/></OperationsProvider>);
  `
  // D01-A1: the REAL receipt dialog of the sales history / cash conference (CupomNaoFiscal + registered reprint panel).
  // Its legacy print paths are observed (never executed): the registered reprint must replace them when direct print is on.
  const reprintStubs: Record<string, string> = {
    ...Object.fromEntries(Object.entries(stubs).filter(([k]) => k !== "components/dashboard/vendas/cupom-nao-fiscal.tsx")),
    "lib/pdv-print-runtime.ts": `export async function printPdvSaleReceipt(){window.__legacyPrint.thermal++;return {ok:true,via:'browser'}}`,
    "lib/thermal-print.ts": `export const escapeHtml=(s)=>String(s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);export function openThermalHtmlPrint(){window.__legacyPrint.html++;return true}`,
  }
  const reprintEntry = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {CupomNaoFiscal} from '@/components/dashboard/vendas/cupom-nao-fiscal';
    window.__legacyPrint={thermal:0,html:0};
    function App(){const [open,setOpen]=React.useState(true);return open?<CupomNaoFiscal isOpen onClose={()=>setOpen(false)} data={window.__cupom} reprintStoreId={window.__reprintStore}/>:<p>fechado</p>}
    createRoot(document.getElementById('root')).render(<App/>);
  `
  const bundleOf = async (contents: string, stubs: Record<string, string>) => (await build({ absWorkingDir: root, stdin: { contents, resolveDir: root, loader: "tsx" }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "print-direct-boundaries", setup(b) {
      b.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.resolved) return
        if (names[args.path]) return { path: args.path, namespace: "synthetic" }
        if (args.resolveDir.replaceAll("\\", "/").includes("/node_modules/")) return
        if (args.path.endsWith("?actual")) return { path: args.path.slice(0, -7) }
        const result = await b.resolve(args.path, { resolveDir: args.resolveDir || root, kind: args.kind, pluginData: { resolved: true } })
        const relative = result.path.replaceAll("\\", "/").slice(root.replaceAll("\\", "/").length + 1)
        if (stubs[relative]) return { path: relative, namespace: "synthetic" }
        // The browser bundle must never carry server code (ledger, keys, Prisma, auth).
        if (/^(app\/actions\/|lib\/prisma|auth\.|lib\/printing\/direct\/(core|db|admin|http|server|codec|authority|activation|sale|renderer)\.ts)/.test(relative) || /@prisma\/client|generated\/prisma/.test(args.path))
          throw new Error(`Server dependency refused in browser bundle: ${relative || args.path}`)
        return { ...result, pluginData: undefined }
      })
      b.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({ contents: stubs[args.path] ?? names[args.path], loader: "tsx", resolveDir: root }))
    } }],
  })).outputFiles[0].contents
  const script = await bundleOf(entry, stubs)
  const reprintScript = await bundleOf(reprintEntry, reprintStubs)
  const server = createServer((req, res) => {
    if (req.headers.host !== new URL(ORIGIN).host) { res.writeHead(403).end(); return }
    if (req.url === "/fixture.js") { res.writeHead(200, { "Content-Type": "text/javascript" }).end(script); return }
    if (req.url === "/reprint.js") { res.writeHead(200, { "Content-Type": "text/javascript" }).end(reprintScript); return }
    if (req.url === "/reprint") {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" })
      res.end('<!doctype html><html><head><style>svg{width:20px;height:20px}button{padding:6px;margin:3px}[role=dialog]{position:fixed;inset:20px;overflow:auto;background:white;z-index:5;padding:12px;border:1px solid black}</style></head><body><div id="root"></div><script src="/reprint.js"></script></body></html>'); return
    }
    if (req.url === "/" || req.url?.startsWith("/?")) {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" })
      res.end('<!doctype html><html><head><style>svg{width:20px;height:20px}button,input{padding:6px;margin:3px}[role=dialog],[role=alertdialog]{position:fixed;inset:20px;overflow:auto;background:white;z-index:5;padding:12px;border:1px solid black}[role=alertdialog]{z-index:10;inset:30%}[data-testid=pdv-direct-print-feedback]{position:fixed;right:0;bottom:0;z-index:2147483646;background:#fff;border:1px solid #000;padding:8px}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); return
    }
    if (req.url === "/health") { res.writeHead(200).end("print-direct-004c"); return }
    res.writeHead(451).end("Unintercepted request refused")
  })
  server.listen(4181, "127.0.0.1", () => process.stdout.write("Print direct 004C harness ready\n"))
}

if (process.argv.includes("--serve")) void serve().catch((error) => { console.error(error); process.exitCode = 1 })
