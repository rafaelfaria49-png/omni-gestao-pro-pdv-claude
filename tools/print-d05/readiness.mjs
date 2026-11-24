/** Offline preparation only. No network, database, installer, task or printer operations. */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const branch = 'codex/omni-print-d05-homologacao-fisica-001'
export const gates = ['NEON_TEST_BRANCH', 'VERCEL_TEST_PREVIEW', 'WINDOWS_PHYSICAL_INSTALL', 'REAL_PRINTER_USE', 'D05_PHYSICAL_EXECUTION']
export const packagePin = Object.freeze({
  version: '0.2.0-d04', sha256: 'e974ca03a8ae862b8f7b7da5d78cd6aa5fca0c1664b5bf114d79870f0452bc77',
  contentId: 'f6af488c0c5d59e70f555f640b2fd97224dbd315b26da8e669335051dec56a40', signed: false,
})
export const cases = [
  ['H01', 'Fila, driver, USB e impressora identificados; montagem autorizada', true],
  ['H02', 'Mesmo SID do pareamento; DPAPI CurrentUser; tarefa Interactive/Limited/IgnoreNew', false],
  ['H03', 'Logon, logoff e reinício físicos; uma única instância', false],
  ['H04', '58 mm/32 colunas; acentos, valores e troco legíveis; primeira via única', true],
  ['H05', '80 mm/48 colunas; corte conforme equipamento; gaveta fechada', true],
  ['H06', 'Chrome e Edge; primeira via única nas larguras suportadas', true],
  ['H07', 'Segunda via autorizada no PDV, Histórico e Conferência; marca visível', true],
  ['H08', 'Fallback por clique explícito; marca e registro; sem emissão por dois canais', true],
  ['H09', 'Impressora desligada; sem reenvio automático; distinguir NO_EFFECT de UNKNOWN', true],
  ['H10', 'Sem papel/fila pausada; preservar fila e UNKNOWN sem reenvio', true],
  ['H11', 'USB desconectada antes/depois do envio; sem duplicidade', true],
  ['H12', 'Internet cai antes/depois do envio; repetir somente relatórios', true],
  ['H13', 'Morte de agente/host; identidade verificada; UNKNOWN durável sem replay', true],
  ['H14', 'Queda de energia autorizada; recuperação sem duplicidade; papel contado', true],
  ['H15', 'Dois agentes e dois caixas; exclusão de instância e vínculos corretos', true],
  ['H16', 'Revogação persistente; atualização preserva diário, instância e DPAPI', false],
  ['H17', 'HTTPS de saída, sem listener/redirect; gaveta nunca abre', true],
  ['H18', 'Limites/retenção/D02 e PDV/offline sem regressão; provas preservadas', false],
]
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export const json = filename => JSON.parse(readFileSync(filename, 'utf8'))
const hasText = value => typeof value === 'string' && value.trim().length > 0
const approval = value => value && hasText(value.by) && hasText(value.reference) && Number.isFinite(Date.parse(value.at))
const equipmentFields = ['ref', 'computerModel', 'windowsVersion', 'nodeVersion', 'powershellVersion', 'chromeVersion', 'edgeVersion', 'printerModel', 'printerSerial', 'driver', 'driverVersion', 'queue', 'port']
const validEquipment = items => Array.isArray(items) && items.length > 0 && items.every(e => e && equipmentFields.every(k => hasText(e[k])) && Array.isArray(e.paperWidthsMm) && e.paperWidthsMm.length > 0 && e.paperWidthsMm.every(w => [58, 80].includes(w))) && new Set(items.map(e => e.ref)).size === items.length

export function makeRecord() {
  return { format: 1, goal: 'OMNI-PRINT-D05-HOMOLOGACAO-FISICA-END-TO-END-001', physicalHomologation: 'PENDING',
    runId: null, releaseCommit: null, operator: null, equipment: [], ownerApproval: null,
    cases: cases.map(([id, expected]) => ({ id, result: 'BLOCKED', reason: 'PENDING_OWNER_APPROVAL_AND_HARDWARE',
      startedAt: null, endedAt: null, operator: null, equipmentRef: null, expected, observed: null,
      couponsBefore: null, couponsAfter: null, technicalIds: {}, evidence: [], correction: null, notApplicableApproval: null })) }
}

export function validatePlan(plan, activation, vercel) {
  const errors = []
  if (plan.gitBranch !== branch || plan.release.id !== 'OMNI-PRINT-D05-HOMOLOGACAO-1' || plan.release.status !== 'PLANNED_NOT_ACTIVE') errors.push('RELEASE_SCOPE_INVALID')
  if (gates.some(g => plan.gates[g] !== 'PENDING_OWNER_APPROVAL')) errors.push('HUMAN_GATES_MUST_REMAIN_PENDING')
  if (plan.database.source !== 'NON_PRODUCTION_SYNTHETIC_ONLY' || plan.database.created !== false || plan.transport.enabled !== false) errors.push('EXTERNAL_EXECUTION_FORBIDDEN')
  if (plan.vercel.environment !== 'preview' || plan.vercel.gitBranch !== branch || plan.vercel.created !== false) errors.push('PREVIEW_SCOPE_INVALID')
  if (plan.environment.some(e => e.target !== 'preview' || e.gitBranch !== branch || 'value' in e)) errors.push('ENV_MUST_BE_BRANCH_SCOPED_WITHOUT_VALUES')
  if (plan.production.approvedRelease !== null || plan.production.databaseAccess !== false || plan.production.writes !== 0 || plan.production.directPrint !== 'DISABLED' || plan.production.cron !== 'DISABLED') errors.push('PRODUCTION_GATE_CHANGED')
  if (!/export const APPROVED_RELEASE: string \| null = null\b/.test(activation)) errors.push('APPROVED_RELEASE_MUST_REMAIN_NULL')
  const deployment = vercel.git?.deploymentEnabled
  if (!deployment || deployment[branch] !== false || Object.entries(deployment).some(([name, enabled]) => enabled !== false || name.includes('*'))) errors.push('AUTOMATIC_DEPLOYMENT_NOT_BLOCKED')
  if (vercel.crons?.length !== 0) errors.push('CRON_MUST_REMAIN_DISABLED')
  if (vercel.buildCommand !== 'node tools/print-d05/build-preview.mjs') errors.push('D05_ISOLATED_BUILD_REQUIRED')
  if (JSON.stringify(plan.agent) !== JSON.stringify(packagePin)) errors.push('D04_PACKAGE_PIN_CHANGED')
  return errors
}

// Exact pin authenticates the reviewed bytes; the manifest alone is not an origin guarantee.
export function verifyPackage(zipFile, packageRoot) {
  if (sha(readFileSync(zipFile)) !== packagePin.sha256) throw new Error('PACKAGE_SHA256_MISMATCH')
  const m = json(path.join(packageRoot, 'MANIFEST.json'))
  if (m.version !== packagePin.version || m.contentId !== packagePin.contentId || m.signature !== null || m.platform !== 'win32' || m.node !== '24.x >=24.12.0' || m.dependencies?.length !== 0 || sha(JSON.stringify(m.files)) !== packagePin.contentId) throw new Error('PACKAGE_MANIFEST_MISMATCH')
  const realRoot = realpathSync(packageRoot)
  for (const [name, digest] of Object.entries(m.files)) {
    const target = realpathSync(path.resolve(realRoot, name))
    if (!target.startsWith(realRoot + path.sep) || sha(readFileSync(target)) !== digest) throw new Error('PACKAGE_FILE_MISMATCH')
  }
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(realRoot, path.join(dir, e.name)).replaceAll(path.sep, '/')])
  const actual = walk(realRoot).sort()
  if (JSON.stringify(actual) !== JSON.stringify([...Object.keys(m.files), 'MANIFEST.json'].sort())) throw new Error('UNMANIFESTED_PACKAGE_FILE')
  return { ...packagePin, files: actual.length, integrity: 'PASS', physicalHomologation: 'PENDING' }
}

export function validateRecord(record) {
  const errors = []
  if (record.format !== 1 || record.goal !== makeRecord().goal) errors.push('RECORD_FORMAT_INVALID')
  if (!Array.isArray(record.cases) || record.cases.length !== 18 || new Set(record.cases.map(c => c.id)).size !== 18 || cases.some(([id]) => !record.cases.some(c => c.id === id))) return [...errors, 'H01_H18_REQUIRED_ONCE']
  const executed = record.cases.some(c => ['PASS', 'FAIL'].includes(c.result))
  if (executed && !validEquipment(record.equipment)) errors.push('EQUIPMENT_MODEL_AND_VERSIONS_REQUIRED')
  for (const c of record.cases) {
    if (!['PASS', 'FAIL', 'BLOCKED', 'N/A'].includes(c.result)) errors.push(c.id + '_INVALID_RESULT')
    if (c.result === 'BLOCKED') { if (!hasText(c.reason)) errors.push(c.id + '_BLOCK_REASON_REQUIRED'); continue }
    if (c.result === 'N/A') {
      if (!['H04', 'H05'].includes(c.id) || !hasText(c.reason) || !approval(c.notApplicableApproval)) errors.push(c.id + '_NA_REQUIRES_UNSUPPORTED_WIDTH_AND_HUMAN_APPROVAL')
      continue
    }
    if (![c.startedAt, c.endedAt].every(t => hasText(t) && Number.isFinite(Date.parse(t))) || Date.parse(c.endedAt) < Date.parse(c.startedAt)) errors.push(c.id + '_TIMESTAMPS_REQUIRED')
    if (![c.operator, c.equipmentRef, c.expected, c.observed].every(hasText)) errors.push(c.id + '_OBSERVATION_REQUIRED')
    if (!record.equipment?.some?.(e => e.ref === c.equipmentRef)) errors.push(c.id + '_UNKNOWN_EQUIPMENT_REFERENCE')
    if (![c.couponsBefore, c.couponsAfter].every(n => Number.isSafeInteger(n) && n >= 0)) errors.push(c.id + '_PHYSICAL_COUNTS_REQUIRED')
    if (!c.technicalIds || Object.keys(c.technicalIds).length === 0) errors.push(c.id + '_TECHNICAL_IDS_REQUIRED')
    if (!Array.isArray(c.evidence) || c.evidence.length === 0 || c.evidence.some(e => !['PHOTO', 'LOG', 'SCREENSHOT', 'VIDEO'].includes(e.kind) || !hasText(e.path) || !/^[a-f0-9]{64}$/.test(e.sha256))) errors.push(c.id + '_EVIDENCE_REQUIRED')
    if (cases.find(([id]) => id === c.id)[2] && !c.evidence?.some(e => e.kind === 'PHOTO')) errors.push(c.id + '_PHOTO_REQUIRED')
  }
  if (!['PENDING', 'PASS', 'FAIL'].includes(record.physicalHomologation)) errors.push('PHYSICAL_VERDICT_INVALID')
  if (record.physicalHomologation === 'PASS') {
    if (!approval(record.ownerApproval) || !hasText(record.runId) || !/^[a-f0-9]{40}$/.test(record.releaseCommit) || !hasText(record.operator) || !validEquipment(record.equipment) || record.cases.some(c => !['PASS', 'N/A'].includes(c.result))) errors.push('PHYSICAL_PASS_REQUIRES_COMPLETION_AND_OWNER_APPROVAL')
    const completion = record.cases.map(c => Date.parse(c.result === 'N/A' ? c.notApplicableApproval?.at : c.endedAt))
    if (!approval(record.ownerApproval) || completion.some(t => !Number.isFinite(t) || Date.parse(record.ownerApproval.at) < t)) errors.push('OWNER_ACCEPTANCE_MUST_FOLLOW_ALL_RESULTS')
  }
  return errors
}

export function verifyEvidenceFiles(record, folder) {
  const errors = [], realRoot = realpathSync(folder)
  for (const c of record.cases) for (const evidence of c.evidence ?? []) {
    try {
      if (path.isAbsolute(evidence.path)) throw new Error('ABSOLUTE_PATH')
      const target = realpathSync(path.resolve(realRoot, evidence.path))
      if (!target.startsWith(realRoot + path.sep) || !statSync(target).isFile() || sha(readFileSync(target)) !== evidence.sha256) throw new Error('INVALID_FILE')
    } catch { errors.push(c.id + '_EVIDENCE_FILE_INVALID') }
  }
  return errors
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, first, second] = process.argv.slice(2)
    let result
    if (command === 'check') {
      const errors = validatePlan(json(path.join(root, 'tools/print-d05/PLAN.json')), readFileSync(path.join(root, 'lib/printing/direct/activation.ts'), 'utf8'), json(path.join(root, 'vercel.json')))
      errors.push(...validateRecord(json(path.join(root, 'docs/print-004c-e2e/evidence/d05/H01-H18.template.json'))))
      result = { preparation: errors.length ? 'FAIL' : 'PASS', physicalHomologation: 'PENDING', errors }
    } else if (command === 'package' && first && second) result = verifyPackage(first, second)
    else if (command === 'record' && first) {
      const record = json(first), errors = [...validateRecord(record), ...verifyEvidenceFiles(record, path.dirname(path.resolve(first)))]
      result = { record: errors.length ? 'FAIL' : 'VALID', physicalHomologation: errors.length ? 'PENDING' : record.physicalHomologation, errors }
    } else throw new Error('USAGE_CHECK_PACKAGE_OR_RECORD')
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.errors?.length ? 1 : 0
  } catch { console.error('D05_VALIDATION_FAILED_NO_EXTERNAL_ACTION'); process.exitCode = 1 }
}
