/** Chromium sobre Configurações e Produto reais; somente I/O e contexto são
 * sintéticos. Sem autenticação alternativa, banco, microfone ou rede externa.
 * SMOKE_CSS_FROM_SOURCE=1 evita depender de build local em discos limitados.
 */
import { build } from "esbuild"
import { chromium, expect } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { applicationCss, serveHarness } from "./cliente-editor-harness.mjs"

const root = process.cwd()
const evidence = path.join(root, "test-results/ramos")
await mkdir(evidence, { recursive: true })
const bundle = await build({
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {BusinessResourcesCard} from '@/components/configuracoes-v3/features/settings/components/BusinessResourcesCard';
    import {ProductAIModal} from '@/components/cadastros/lovable/components/cadastros/produto-ia';
    import {HarnessContext} from '@/lib/use-store-business';
    import {businessPresentation,resolveBusinessResource} from '@/lib/store-business-capabilities';
    import {mergePrinterConfigServerSide} from '@/lib/pdv-settings-server-first';
    window.__saves=[];window.__products=[];
    window.fetch=async()=>({ok:true,json:async()=>({})});
    function App(){const [caps,setCaps]=useState({version:1,business:{primaryBranch:'padaria'}});const [product,setProduct]=useState(false);
      const context={storeId:'loja-sintetica',ready:true,hydrated:true,configured:true,capabilities:caps,
        branch:caps.business.primaryBranch,presentation:businessPresentation(caps),canConfigure:true,
        resource:key=>resolveBusinessResource(caps,key),
        save:async patch=>{window.__saves.push(patch);setCaps(current=>mergePrinterConfigServerSide({capabilities:current},patch.printerConfig,false).capabilities)}};
      return <HarnessContext.Provider value={context}><main className="mx-auto max-w-5xl p-4 sm:p-8">
        <h1 className="mb-4 text-lg font-semibold">Validação isolada · Ramo e cadastro reais</h1>
        <button className="mb-4 rounded border px-4 py-3" onClick={()=>setProduct(true)}>Novo produto isolado</button>
        <BusinessResourcesCard/>
        <ProductAIModal key={String(product)} open={product} onClose={()=>setProduct(false)} storeId="loja-sintetica"/>
      </main></HarnessContext.Provider>}
    createRoot(document.getElementById('root')).render(<App/>);` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "ramos-isolated-io", setup(api) {
    const mocks = {
      "@/lib/auth/use-enterprise-permissions": `export const useEnterprisePermissions=()=>({platformAuthority:true});`,
      "@/lib/use-store-business": `import React from 'react';export const HarnessContext=React.createContext(null);export const useStoreBusiness=()=>React.useContext(HarnessContext);`,
      "@/app/actions/cadastros": `export const listCategorias=async()=>[];export const listMarcas=async()=>[];
        export const listCategoriasMarcasUsadasEmProduto=async()=>({categorias:[],marcas:[]});
        export const upsertCategoria=async()=>({id:'cat',name:'Categoria'});export const upsertMarca=upsertCategoria;
        export const lookupProdutoPorBarcodeLocal=async()=>({ok:true,produto:null});export const resolverCodigoBarras=lookupProdutoPorBarcodeLocal;
        export async function upsertProduto(store,input){window.__products.push({store,input});return {ok:true,id:'synthetic-product'}};`,
      "@/app/actions/produto-texto-livre": `export const interpretarProdutoTextoLivre=async()=>({ok:false,message:'Não exercitado neste smoke'});`,
      "@/components/configuracoes-v3/hooks/use-toast": `export const useToast=()=>({toast:()=>{}});`,
      "./MovimentacaoEstoqueModal": `export const MovimentacaoEstoqueModal=()=>null;`,
    }
    api.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "ramos-io" } : undefined)
    api.onLoad({ filter: /.*/, namespace: "ramos-io" }, (args) => ({ resolveDir: root, contents: mocks[args.path] }))
  } }],
})
const server = await serveHarness({ js: bundle.outputFiles[0].text, css: await applicationCss(root) })
let browser
const results = []
try {
  browser = await chromium.launch({ headless: true })
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 844 } })
    const errors = [], external = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("request", (req) => { if (!req.url().startsWith(server.origin)) external.push(req.url()) })
    await page.goto(server.origin)
    await page.getByRole("combobox", { name: "Ramo principal" }).waitFor()
    assert.equal(await page.getByRole("checkbox", { name: /Assistência técnica/ }).isChecked(), false)
    assert.equal(await page.getByRole("checkbox", { name: /Acessórios para aparelhos/ }).isChecked(), false)
    await page.screenshot({ path: path.join(evidence, `configuracoes-${width}.png`), fullPage: true })
    await page.getByRole("combobox", { name: "Ramo principal" }).selectOption("variedades")
    await page.getByRole("checkbox", { name: /Produtos por peso/ }).check()
    await page.getByRole("checkbox", { name: /Grade comercial/ }).check()
    await page.getByRole("button", { name: "Salvar ramo e recursos" }).click()
    await expect.poll(() => page.evaluate(() => window.__saves.length)).toBe(1)
    const settingsPatch = await page.evaluate(() => window.__saves[0])
    assert.equal(settingsPatch.printerConfig.capabilities.business.primaryBranch, "variedades")
    assert.deepEqual(Object.keys(settingsPatch.printerConfig), ["capabilities"])
    await page.getByRole("button", { name: "Novo produto isolado" }).click()
    await page.getByRole("combobox", { name: "Forma de venda" }).selectOption("peso")
    await page.getByPlaceholder("Ex.: Nome da mercadoria").last().fill("Grãos sintéticos")
    assert.equal(await page.getByText(/Venda bloqueada até a integração/).isVisible(), true)
    assert.equal(await page.getByText(/Configuração de acessórios/).count(), 0)
    assert.equal(await page.locator("body").innerText().then((text) => /capinhas|películas|modelo compatível|equipamentos/i.test(text)), false)
    await page.getByRole("combobox", { name: "Forma de venda" }).scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await page.locator('[data-omni-ui-kit="modal-body"]').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true)
    await page.screenshot({ path: path.join(evidence, `produto-${width}.png`), fullPage: true })
    await page.getByRole("button", { name: "Salvar produto", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__products.length)).toBe(1)
    const product = await page.evaluate(() => window.__products[0])
    assert.equal(product.store, "loja-sintetica")
    assert.equal(product.input.metadata.comercial.modoVenda, "peso")
    assert.equal(Object.hasOwn(product.input, "accessoryConfig"), false)
    assert.equal(Object.hasOwn(product.input.metadata.atributos, "modeloCompativel"), false)
    assert.deepEqual(errors, []); assert.deepEqual(external, [])
    results.push({ width, settings: "SIMULATED_IO", product: "SIMULATED_IO", operationalWeight: false, overflow: false, pageErrors: 0, externalRequests: 0 })
    await page.close()
  }
  await writeFile(path.join(evidence, "browser-smoke.json"), JSON.stringify({ scope: "Componentes reais e CSS do app; somente I/O/contexto sintéticos; zero banco", browser: browser.version(), results }, null, 2))
  console.log(JSON.stringify({ status: "PASS", viewports: results.map((item) => item.width), evidence }))
} finally { await browser?.close(); await server.close() }
