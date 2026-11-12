import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { branch, cases, json, makeRecord, root, validatePlan, validateRecord, verifyEvidenceFiles, verifyPackage } from './readiness.mjs'

test('preparation cannot open a human gate, transport, global Preview, production or automatic deployment', () => {
  const plan = json(path.join(root, 'tools/print-d05/PLAN.json')), activation = 'export const APPROVED_RELEASE: string | null = null', vercel = { git: { deploymentEnabled: { [branch]: false } }, crons: [], buildCommand: 'node tools/print-d05/build-preview.mjs' }
  assert.deepEqual(validatePlan(plan, activation, vercel), [])
  const mutate = change => { const p = structuredClone(plan); change(p); assert.ok(validatePlan(p, activation, vercel).length) }
  mutate(p => { p.gates.REAL_PRINTER_USE = 'APPROVED' })
  mutate(p => { p.transport.enabled = true })
  mutate(p => { p.environment[0].gitBranch = '' })
  mutate(p => { p.environment[0].value = 'do-not-store-secrets' })
  mutate(p => { p.database.source = 'PRODUCTION_COPY' })
  mutate(p => { p.production.approvedRelease = 'D05' })
  assert.ok(validatePlan(plan, activation.replace('= null', '= "D05"'), vercel).length)
  assert.ok(validatePlan(plan, activation, { ...vercel, git: { deploymentEnabled: { [branch]: false, '*': true } } }).length)
  assert.ok(validatePlan(plan, activation, { ...vercel, buildCommand: 'node scripts/vercel-build.mjs' }).length)
})
test('missing case, duplicate case, unsupported status and unapproved N/A fail', () => {
  const r = makeRecord(); assert.deepEqual(validateRecord(r), [])
  r.cases.pop(); assert.ok(validateRecord(r).length)
  r.cases.push(r.cases[0]); assert.ok(validateRecord(r).length)
  const na = makeRecord(); na.cases[0].result = 'N/A'; assert.ok(validateRecord(na).length)
  const invalid = makeRecord(); invalid.cases[0].result = 'PASS_SIMULATED'; assert.ok(validateRecord(invalid).length)
})
test('software/spooler success and a bare owner name cannot become physical PASS', () => {
  const r = makeRecord(); r.physicalHomologation = 'PASS'; r.ownerApproval = { by: 'synthetic' }
  assert.ok(validateRecord(r).length)
  for (const c of r.cases) c.result = 'PASS'
  assert.ok(validateRecord(r).some(e => e.includes('EVIDENCE_REQUIRED')))
  assert.ok(validateRecord(r).some(e => e.includes('PHYSICAL_COUNTS_REQUIRED')))
  assert.ok(validateRecord(r).some(e => e.includes('PHOTO_REQUIRED')))
})
test('complete synthetic record validates shape only; physical artifacts and human truth remain separate', () => {
  const r = makeRecord(); r.runId = 'synthetic-validator-test'; r.operator = 'synthetic'; r.releaseCommit = 'a'.repeat(40)
  r.equipment = [{ ref: 'synthetic', computerModel: 'synthetic', windowsVersion: 'synthetic', nodeVersion: '24.22.1', powershellVersion: '5.1', chromeVersion: 'synthetic', edgeVersion: 'synthetic', printerModel: 'synthetic', printerSerial: 'synthetic', driver: 'synthetic', driverVersion: 'synthetic', queue: 'synthetic', port: 'synthetic', paperWidthsMm: [58, 80] }]
  r.ownerApproval = { by: 'synthetic', reference: 'unit-test-only', at: '2026-11-05T12:00:00-03:00' }; r.physicalHomologation = 'PASS'
  for (const c of r.cases) Object.assign(c, { result: 'PASS', startedAt: '2026-11-05T10:00:00-03:00', endedAt: '2026-11-05T10:01:00-03:00', operator: 'synthetic', equipmentRef: 'synthetic', observed: 'shape only, no physical test', couponsBefore: 0, couponsAfter: 1, technicalIds: { test: 'synthetic' }, evidence: [{ kind: 'PHOTO', path: 'synthetic.png', sha256: 'a'.repeat(64) }] })
  assert.equal(cases.length, 18); assert.deepEqual(validateRecord(r), [])
  assert.equal(verifyEvidenceFiles(r, root).length, 18)
  const check = mutate => { const copy = structuredClone(r); mutate(copy); assert.ok(validateRecord(copy).length) }
  check(c => { c.equipment = {} })
  check(c => { c.equipment[0].windowsVersion = '' })
  check(c => { c.cases[0].equipmentRef = 'unregistered-equipment' })
  check(c => { c.ownerApproval.at = '2000-01-01T00:00:00Z' })
  check(c => { c.cases[3].result = 'N/A'; c.cases[3].notApplicableApproval = { by: 'synthetic', reference: 'synthetic', at: '2026-11-06T12:00:00-03:00' } })
  r.cases[0].endedAt = '2026-11-04T10:00:00-03:00'; assert.ok(validateRecord(r).length)
})
test('artifact verifier refuses missing, changed and escaping evidence and wrong packages', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'd05-evidence-'))
  try {
    const bytes = Buffer.from('synthetic-log-only'); writeFileSync(path.join(folder, 'sample.log'), bytes)
    const r = makeRecord(); const e = { kind: 'LOG', path: 'sample.log', sha256: createHash('sha256').update(bytes).digest('hex') }; r.cases[0].evidence = [e]
    assert.deepEqual(verifyEvidenceFiles(r, folder), [])
    e.sha256 = '0'.repeat(64); assert.ok(verifyEvidenceFiles(r, folder).length)
    e.path = '../outside.log'; assert.ok(verifyEvidenceFiles(r, folder).length)
    assert.throws(() => verifyPackage(path.join(folder, 'sample.log'), folder), /PACKAGE_SHA256_MISMATCH/)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
