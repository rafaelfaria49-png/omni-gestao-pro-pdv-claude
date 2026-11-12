// Match Next's existing server-only resolution solely in this explicit server CLI process.
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
if (!process.execArgv.includes('--conditions=react-server')) throw new Error('D05_SERVER_CONTEXT_REQUIRED')
const serverMarker = pathToFileURL(createRequire(import.meta.url).resolve('next/dist/compiled/server-only/empty.js')).href
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === 'server-only' ? { url: serverMarker, shortCircuit: true } : nextResolve(specifier, context)
} })
