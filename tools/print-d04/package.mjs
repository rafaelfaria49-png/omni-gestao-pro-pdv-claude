// Reproducible ZIP (STORE, sorted entries, fixed DOS timestamp), built with Node built-ins only.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = path.join(root, 'tools/omni-print-agent')
export const runtimeFiles = ['agent.mjs', 'journal.mjs', 'lifecycle.mjs', 'maintenance.mjs', 'protocol.mjs', 'runtime.mjs', 'runtime-windows.ps1', 'spooler-windows.mjs', 'supervisor.mjs', 'README.md']
const sha = data => createHash('sha256').update(data).digest('hex')
const crc32 = bytes => { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }; return (crc ^ -1) >>> 0 }
export function zip(entries) {
  const chunks = [], directory = []; let offset = 0
  for (const [name, bytes] of entries) {
    const filename = Buffer.from(name), local = Buffer.alloc(30), central = Buffer.alloc(46), crc = crc32(bytes)
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26)
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(33, 14)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42)
    chunks.push(local, filename, bytes); directory.push(central, filename); offset += local.length + filename.length + bytes.length
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, central, end])
}
export function buildPackage(out) {
  const names = [...runtimeFiles, ...readdirSync(path.join(source, 'windows')).filter(n => n.endsWith('.ps1')).map(n => 'windows/' + n)].sort()
  const entries = names.map(n => [n, Buffer.from(readFileSync(path.join(source, n), 'utf8').replace(/\r\n/g, '\n'))])
  const files = Object.fromEntries(entries.map(([n, b]) => [n, sha(b)]))
  const contentId = sha(JSON.stringify(files))
  const manifest = { format: 1, version: '0.2.0-d04', contentId, node: '24.x >=24.12.0', platform: 'win32', dependencies: [], signature: null, files }
  entries.push(['MANIFEST.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')]); entries.sort(([a], [b]) => a.localeCompare(b, 'en'))
  const archive = zip(entries), checksum = sha(archive), folder = path.join(out, 'omni-print-agent')
  mkdirSync(folder, { recursive: true })
  for (const [name, bytes] of entries) { const f = path.join(folder, name); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, bytes) }
  const file = path.join(out, 'omni-print-agent-0.2.0-d04.zip')
  writeFileSync(file, archive); writeFileSync(file + '.sha256', checksum + '  ' + path.basename(file) + '\n')
  return { file, sha256: checksum, contentId, signed: false, files: entries.length }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] || path.join(root, 'tools/print-d04/.artifacts'))
  if (existsSync(path.join(out, 'config.json')) || existsSync(path.join(out, 'journal.jsonl'))) throw new Error('OUTPUT_CONTAINS_AGENT_STATE')
  console.log(JSON.stringify(buildPackage(out), null, 2))
}
