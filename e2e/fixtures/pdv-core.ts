/** Synthetic I/O only. No Next server, .env, database client or production auth.
 * The browser bundle keeps the four surfaces, PaymentModal, OperationsProvider,
 * retrySyncSale, audit-log and local financial effects unchanged. */
import { createServer } from "node:http"
import { resolve } from "node:path"
import type { SaleRecord } from "../../lib/operations-sale-types"

export const ORIGIN = "http://127.0.0.1:4179"
export const STORE = "n5-c-synthetic"
export const OPS_KEY = `assistec-pro-ops-v1-${STORE}`
export const CUSTOMER = { id: "n5-c-customer", name: "Cliente sintético", document: "52998224725", phone: "11999990000" }
export const INVENTORY = [{ id: "n5-c-product", name: "Produto sintético", price: 100, stock: 10, cost: 20, category: "Teste", sku: "N5C001" }]
export const SURFACES = ["classic", "assistencia", "supermercado", "venda-completa"] as const
export type Surface = typeof SURFACES[number]

export function seedStorage(storage: Pick<Storage, "setItem">, surface: Surface, withCart = false) {
  storage.setItem(OPS_KEY, JSON.stringify({ inventory: INVENTORY, ordens: [], sales: [], devolucoes: [],
    caixa: { isOpen: true, saldoInicial: 100, dataAbertura: new Date().toISOString(), totalEntradas: 0, totalSaidas: 0 },
    caixaSessaoId: "n5-c-caixa", customerCredits: { [CUSTOMER.document]: { nome: CUSTOMER.name, saldo: 150 } },
  }))
  if (surface === "assistencia") storage.setItem(`omnigestao:pdv-assistencia-cart:${STORE}`, JSON.stringify({
    cart: withCart ? [{ lineId: "n5-c-line", inventoryId: INVENTORY[0].id, title: INVENTORY[0].name, price: 100, qty: 2, itemType: "produto" }] : [],
    customerName: CUSTOMER.name, clienteId: CUSTOMER.id, clienteDoc: CUSTOMER.document,
    discount: withCart ? 10 : 0, discountType: "reais", discountReais: withCart ? 10 : 0, discountPercent: 0, savedAt: new Date().toISOString(),
  }))
  if (surface === "venda-completa") storage.setItem(`omnigestao:venda-completa-ent-v2:${STORE}`, JSON.stringify({ cart: [], cliente: CUSTOMER, discountReais: 0 }))
}

type Wire = { sale: SaleRecord; clientSaleId: string }
export class SyntheticBackend {
  posts: Wire[] = []
  audits: Array<{ action: string; detail: string }> = []
  unexpected: string[] = []
  confirmed = new Map<string, SaleRecord>()
  failWrites = false
  pauseWrites = false
  releaseWrite?: () => void
  credit = 150
  async respond(raw: string, method = "GET", body?: string | null): Promise<{ status: number; body: unknown }> {
    const url = new URL(raw, ORIGIN)
    const key = `${method} ${url.pathname}`
    const ok = (body: unknown) => ({ status: 200, body })
    if (url.origin !== ORIGIN) { this.unexpected.push(key); throw new Error(`External origin refused: ${url.origin}`) }
    const store = url.searchParams.get("storeId") ?? url.searchParams.get("lojaId")
    if (store && store !== STORE) { this.unexpected.push(key); throw new Error("Non-synthetic store refused") }
    if (key === "GET /api/ops/inventory") return ok({ items: INVENTORY })
    if (key === "GET /api/ops/ordens") return ok({ ordens: [] })
    if (key === "GET /api/ops/servicos") return ok({ items: [] })
    if (key === "GET /api/ops/vendas-list") return ok({ sales: [...this.confirmed.values()] })
    if (key === "GET /api/ops/caixa/sessoes") return ok({ sessoes: [{ id: "n5-c-caixa", storeId: STORE, terminalId: null, saldoInicial: 100, abertaEm: new Date().toISOString() }] })
    if (key === "GET /api/ops/credito-cliente") return ok({ creditos: { [CUSTOMER.document]: { nome: CUSTOMER.name, saldo: this.credit } } })
    if (key === "GET /api/ops/venda-persist/v2") return ok({ writer: "v2" })
    if (key === "POST /api/ops/venda-persist/v2") {
      const wire = JSON.parse(body ?? "null") as Wire
      if (!wire?.clientSaleId || wire.sale?.clientSaleId !== wire.clientSaleId) throw new Error("Writer identity missing")
      this.posts.push(wire)
      if (this.failWrites) throw new Error("Synthetic network failure")
      if (this.pauseWrites) await new Promise<void>((done) => { this.releaseWrite = done })
      let sale = this.confirmed.get(wire.clientSaleId)
      if (!sale) {
        sale = { ...wire.sale, id: `VDA-N5C-${this.confirmed.size + 1}`, syncPending: false }
        this.confirmed.set(wire.clientSaleId, sale)
        this.credit -= sale.paymentBreakdown?.creditoVale ?? 0
      }
      return ok({ venda: { ...sale, pedidoId: sale.id, id: `server-${sale.id}`, storeId: STORE } })
    }
    if (key === "POST /api/audit/log") { this.audits.push(JSON.parse(body ?? "{}")); return ok({ ok: true }) }
    if (key === "POST /api/ops/sync-ledger" || key === "PUT /api/ops/ordens") return ok({ ok: true })
    if (key === "GET /api/auth/admin") return ok({ authenticated: false })
    if (key === `GET /api/stores/${STORE}`) return ok({ store: { id: STORE, name: "Loja sintética" } })
    if (key === `GET /api/stores/${STORE}/settings`) return ok({ settings: {} })
    if (key === "POST /api/clientes/search") return ok({ items: [CUSTOMER], clientes: [CUSTOMER] })
    if (key === "GET /api/clientes") return ok({ clientes: [CUSTOMER] })
    if (key === "POST /__fixture/enrich") return ok({ ok: true })
    this.unexpected.push(key)
    throw new Error(`Unplanned request refused: ${key}`)
  }
  fetch: typeof fetch = async (input, init) => {
    const r = await this.respond(String(input), init?.method, init?.body as string | undefined)
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } })
  }
}

// Only these I/O/provider boundaries are replaced. Relative imports resolve to
// the same absolute paths; business handlers and payment helpers are never aliased.
async function serve() {
  const { build } = await import("esbuild")
  const root = process.cwd()
  const stubs: Record<string, string> = {
    "lib/loja-ativa.tsx": `export const OPS_KEY_LEGACY='assistec-pro-ops-v1'; export function useLojaAtiva(){return {lojaAtivaId:'${STORE}',opsStorageKey:'${OPS_KEY}',empresaDocumentos:{nomeFantasia:'Loja sintética'},getEnderecoDocumentos:()=>''}}`,
    "lib/store-settings-provider.tsx": `import {defaultFormasPagamento} from '@/lib/pdv-formas-pagamento'; const params={formasPagamento:defaultFormasPagamento(),atalhosRapidos:[],incluirImpostoEstimadoNoPdv:false,aliquotaImpostoEstimadoPdv:0}; export function useStoreSettings(){return {pdvParams:params,blob:{pdvParams:params},settings:{},hydrated:true,storeId:'${STORE}',impressaoConfig:{imprimirAutomatico:false,rodapeCupom:''},save:()=>{}}}`,
    "lib/config-empresa.tsx": `import {configPadrao} from '${resolve(root, "lib/config-empresa.tsx").replaceAll("\\", "/")}?actual';export function useConfigEmpresa(){return {config:configPadrao}};export {configPadrao}`,
    "components/theme/ThemeProvider.tsx": `export const useStudioTheme=()=>({mode:'classic'})`,
    "lib/pdv-operador-nome.ts": `export const usePdvOperadorNome=()=> 'Operador sintético'`,
    "lib/pdv-operator-id.ts": `export const getOrCreatePdvOperatorId=()=> 'n5-c-operator'`,
    "components/dashboard/caixa/caixa-provider.tsx": `import {useOperationsStore} from '@/lib/operations-store';export function useCaixa(){const s=useOperationsStore();return {caixa:s.caixa,sessaoId:'n5-c-caixa'}}`,
    "components/dashboard/caixa/use-atualizar-caixa.ts": `export const useGarantirSessaoCaixa=()=>({garantirSessao:async()=>true})`,
    "components/dashboard/caixa/caixa-status-bar.tsx": `export const CaixaStatusBar=()=>null`,
    "lib/automation/automation-engine.ts": `export const initAutomationEngineClient=()=>{}`,
    "app/actions/vendas-enterprise.ts": `export async function enrichVendaEnterprise(data){return fetch('/__fixture/enrich',{method:'POST',body:JSON.stringify(data)}).then(r=>r.json())}`,
    "components/dashboard/vendas/trocas-devolucao.tsx": `export const TrocasDevolucao=()=>null`,
    "components/dashboard/vendas/pdv-recebimento-modal.tsx": `export const PdvRecebimentoModal=()=>null`,
    "components/dashboard/vendas/acessorios/selecionar-acessorio-dialog.tsx": `export const SelecionarAcessorioDialog=()=>null`,
    "components/dashboard/vendas/cupom-nao-fiscal.tsx": `export const CupomNaoFiscal=()=>null`,
    "components/dashboard/vendas/pdv-auto-print-feedback.tsx": `export const PdvAutoPrintFeedback=()=>null`,
    "components/dashboard/vendas/pdv-post-sale-dialog.tsx": `export const PdvPostSaleDialog=()=>null`,
  }
  const names: Record<string, string> = {
    'next/navigation': `export const useRouter=()=>({push:()=>{},replace:()=>{}})`,
    'next-auth/react': `export const useSession=()=>({data:null})`,
  }
  const entry = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {OperationsProvider,useOperationsStore} from '@/lib/operations-store';
    import {PdvClassic} from '@/components/dashboard/vendas/pdv-classic';
    import {PdvAssistenciaEnterprise} from '@/components/dashboard/vendas/pdv-assistencia-enterprise';
    import {PdvSupermercado} from '@/components/dashboard/vendas/pdv-supermercado';
    import {VendaCompletaEnterprise} from '@/components/dashboard/vendas/venda-completa-enterprise';
    import {subscribeAllEvents} from '@/lib/events/event-bus';
    window.__n5={events:[]};subscribeAllEvents((event,payload)=>window.__n5.events.push({event,payload}));
    function App(){const ops=useOperationsStore();window.__n5.ops=ops;
      const surface=new URLSearchParams(location.search).get('surface');
      return <><aside aria-label="Driver sintético" style={{position:'fixed',right:0,top:0,zIndex:2147483647,pointerEvents:'auto'}}><button onClick={()=>ops.retrySyncSale(ops.sales[0]?.clientSaleId||ops.sales[0]?.id)}>Reenviar mesma venda</button></aside>
      {surface==='classic'?<PdvClassic/>:surface==='assistencia'?<PdvAssistenciaEnterprise/>:surface==='supermercado'?<PdvSupermercado/>:<VendaCompletaEnterprise onBack={()=>{}}/>}</>}
    createRoot(document.getElementById('root')).render(<OperationsProvider storageKey='${OPS_KEY}'><App/></OperationsProvider>);
  `
  const bundle = await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "synthetic-boundaries", setup(b) {
      b.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.resolved) return
        if (names[args.path]) return { path: args.path, namespace: "synthetic" }
        if (/@prisma\/client/.test(args.path)) throw new Error(`Server dependency refused: ${args.path}`)
        if (args.resolveDir.replaceAll("\\", "/").includes("/node_modules/")) return
        if (args.path.endsWith("?actual")) return { path: args.path.slice(0, -7) }
        const result = await b.resolve(args.path, { resolveDir: args.resolveDir || root, kind: args.kind, pluginData: { resolved: true } })
        const relative = result.path.replaceAll("\\", "/").slice(root.replaceAll("\\", "/").length + 1)
        if (stubs[relative]) return { path: relative, namespace: "synthetic" }
        if (/^(app\/actions\/|lib\/prisma|auth\.)/.test(relative) || /@prisma\/client/.test(args.path)) throw new Error(`Server dependency refused: ${args.path}`)
        return { ...result, pluginData: undefined }
      })
      b.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({ contents: stubs[args.path] ?? names[args.path], loader: "tsx", resolveDir: root }))
    } }],
  })
  const script = bundle.outputFiles[0].contents
  const server = createServer((req, res) => {
    if (req.headers.host !== new URL(ORIGIN).host) { res.writeHead(403).end(); return }
    if (req.url === "/fixture.js") { res.writeHead(200, { "Content-Type": "text/javascript" }).end(script); return }
    if (req.url?.startsWith("/?surface=")) {
      res.writeHead(200, { "Content-Type": "text/html", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" })
      res.end('<!doctype html><html><head><style>svg{width:20px;height:20px}button,input{padding:6px;margin:3px}[role=dialog],[role=alertdialog]{position:fixed;inset:20px;overflow:auto;background:white;z-index:5;padding:12px;border:1px solid black}[role=alertdialog]{z-index:10;inset:30%}aside{position:fixed;right:0;top:0;z-index:2147483647}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); return
    }
    if (req.url === "/health") { res.writeHead(200).end("synthetic-n5-c"); return }
    // There is deliberately no network proxy or writer on this server.
    res.writeHead(451).end("Unintercepted request refused")
  })
  server.listen(4179, "127.0.0.1", () => process.stdout.write("PDV synthetic harness ready\n"))
}

if (process.argv.includes("--serve")) void serve().catch((error) => { console.error(error); process.exitCode = 1 })
