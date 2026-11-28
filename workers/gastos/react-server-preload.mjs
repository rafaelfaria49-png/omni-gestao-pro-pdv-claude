/**
 * Preload do worker G006 com o assistente G007/G008: resolve o marcador `server-only` como o Next resolve.
 * O pacote não é dependência própria do repo — o Next o embute em `next/dist/compiled/server-only` com
 * `exports: { "react-server": "./empty.js", default: "./index.js" }`. Aqui a MESMA regra: só com
 * `--conditions=react-server` o marcador vira módulo vazio; sem a condição, aponta para `index.js`, que lança
 * (falha fechada). Nada mais é redirecionado.
 * Uso: node --conditions=react-server --import ./workers/gastos/react-server-preload.mjs --import tsx workers/gastos/index.ts
 */
import { registerHooks } from "node:module"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const base = require.resolve("next/dist/compiled/server-only/package.json").replace(/package\.json$/, "")
const reactServer = process.execArgv.some((a, i, all) => a === "--conditions=react-server" || a === "-C=react-server"
  || ((a === "--conditions" || a === "-C") && all[i + 1] === "react-server"))
const alvo = pathToFileURL(base + (reactServer ? "empty.js" : "index.js")).href

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador === "server-only") return { url: alvo, shortCircuit: true, format: "commonjs" }
    return proximo(especificador, contexto)
  },
})
