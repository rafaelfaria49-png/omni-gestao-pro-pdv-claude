/** Isolated harness of the actual HUB client editor (CAD-R2-021).
 * Bundles the real editor/parser; only the two Server Actions are replaced by in-page
 * simulated I/O. No auth bypass, no DB, no network beyond the loopback server.
 */
import { build } from "esbuild"
import { createServer } from "node:http"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

export async function buildClienteEditorBundle(root) {
  const bundle = await build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {ClienteEditorDialog} from '@/components/cadastros/lovable/components/cadastros/ClienteEditor';
      window.__saves=[]; window.__interpretations=[]; window.__delayMs=0;
      function App(){const [open,setOpen]=useState(true);const [store,setStore]=useState('loja-a');
        window.__switchStore=()=>setStore('loja-b');
        return <main className="p-6"><h1>Smoke isolado do editor real de Clientes</h1>
          <button onClick={()=>setOpen(true)}>Novo cliente isolado</button>
          <ClienteEditorDialog key={store} open={open} storeId={store} editing={null}
            onClose={()=>setOpen(false)} onSaved={()=>setOpen(false)}/></main>}
      createRoot(document.getElementById('root')).render(<App/>);` },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "isolated-actions", setup(api) {
      api.onResolve({ filter: /^@\/app\/actions\/cliente-texto-livre$/ }, () => ({ path: "actions", namespace: "isolated" }))
      api.onLoad({ filter: /.*/, namespace: "isolated" }, () => ({ resolveDir: root, contents: `
        import {interpretarTextoCliente} from '@/lib/cadastros/natural-text/cliente';
        export async function interpretarClienteTextoLivre(store,text,source){
          if(source!=='text'&&source!=='voice')throw new Error('Unknown source');
          await new Promise(r=>setTimeout(r,window.__delayMs));
          window.__interpretations.push({store,source});return {ok:true,sugestao:interpretarTextoCliente(text)};
        }
        export async function salvarClienteRevisado(store,id,values,confirmed){
          if(!confirmed)throw new Error('Review required');
          window.__saves.push({store,id,values,confirmed});return {ok:true,id:'synthetic'};
        }` }))
    } }],
  })
  return bundle.outputFiles[0].text
}

/** Build CSS from `npm run build`; `SMOKE_CSS_FROM_SOURCE=1` compiles app/globals.css instead. */
export async function applicationCss(root) {
  if (process.env.SMOKE_CSS_FROM_SOURCE === "1") {
    const { default: postcss } = await import("postcss")
    const { default: tailwind } = await import("@tailwindcss/postcss")
    const from = path.join(root, "app/globals.css")
    return (await postcss([tailwind()]).process(await readFile(from, "utf8"), { from })).css
  }
  const cssDir = path.join(root, ".next/static/css")
  return (await Promise.all((await readdir(cssDir)).filter((f) => f.endsWith(".css")).map((f) => readFile(path.join(cssDir, f), "utf8")))).join("\n")
}

/** Loopback server with a restrictive CSP and the app's microphone Permissions-Policy. */
export async function serveHarness({ js, css }) {
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store")
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(js) }
    else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css) }
    else {
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'")
      res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()")
      res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Cliente isolated smoke</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>')
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}
