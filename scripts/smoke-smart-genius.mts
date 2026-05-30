// Smoke manual contra os .xls reais de migração. NÃO faz parte do build.
// Uso: npx tsx scripts/smoke-smart-genius.mts "<clientes.xls>" "<contas.xls>"
import { parsearArquivoSmart } from "../lib/importador-avancado/smart-genius/parser"
import * as fs from "node:fs"

const [, , pathClientes, pathContas] = process.argv
const alvos: Array<[string, string]> = []
if (pathClientes) alvos.push(["CLIENTES", pathClientes])
if (pathContas) alvos.push(["CONTAS", pathContas])

for (const [label, path] of alvos) {
  const buf = fs.readFileSync(path)
  const r = await parsearArquivoSmart(buf, path.split(/[\\/]/).pop()!)
  if (!r.ok) {
    console.log(label, "=> NAO E SMART")
    continue
  }
  if ("clientes" in r) {
    console.log(
      label,
      "validos=", r.clientes.validos.length,
      "invalidos=", r.clientes.invalidos.length,
      "lidas=", r.clientes.totalLinhasLidas,
    )
    console.log("  amostra:", JSON.stringify(r.clientes.validos.slice(0, 2)))
  } else {
    const v = r.contas.validos
    let titAtraso = 0, titVencer = 0, somaAtraso = 0, somaVencer = 0
    for (const c of v) {
      if (c.emAtraso > 0) { titAtraso++; somaAtraso += c.emAtraso }
      if (c.aVencer > 0) { titVencer++; somaVencer += c.aVencer }
    }
    console.log(
      label,
      "validos=", v.length,
      "invalidos=", r.contas.invalidos.length,
      "lidas=", r.contas.totalLinhasLidas,
    )
    console.log(
      "  titulos VENCIDO=", titAtraso, `(R$ ${somaAtraso.toFixed(2)})`,
      "PENDENTE=", titVencer, `(R$ ${somaVencer.toFixed(2)})`,
    )
    console.log("  amostra:", JSON.stringify(v.slice(0, 2)))
  }
}
