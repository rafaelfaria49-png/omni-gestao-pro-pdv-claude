/**
 * Source hygiene for the 004C files: no literal control, bidi, zero-width, BOM, NBSP or U+FFFD characters in
 * source text (trojan-source class). Usage: node tools/print-004c-e2e/source-hygiene.mjs [--fix] <files...>
 */
import { readFileSync, writeFileSync } from "node:fs"

const DANGEROUS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u00a0\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff\ufffd]/gu
const fix = process.argv.includes("--fix")
let bad = 0
for (const file of process.argv.slice(2).filter(a => !a.startsWith("--"))) {
  const text = readFileSync(file, "utf8")
  const hits = [...text.matchAll(DANGEROUS)]
  if (!hits.length) continue
  bad += hits.length
  console.log(`${file}: ${hits.map(m => "U+" + m[0].codePointAt(0).toString(16).padStart(4, "0")).join(" ")}`)
  if (fix) writeFileSync(file, text.replace(DANGEROUS, c => "\\u" + c.codePointAt(0).toString(16).padStart(4, "0")))
}
if (bad && !fix) process.exitCode = 1
console.log(bad ? `${bad} literal(s) ${fix ? "escaped" : "found"}` : "SOURCE_HYGIENE_OK")
