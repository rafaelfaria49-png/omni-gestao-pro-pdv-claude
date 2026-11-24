/** Explicit read-only proof for the pinned D05 endpoint, with no credential output. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { rootCertificates } from 'node:tls'
import { PrismaClient } from '../../generated/prisma/index.js'
import { D05_TARGET } from '../../lib/printing/direct/homologation.mjs'
import { privateEnvironment, sanitized } from './environment.mjs'

let prisma
try {
  const privateRoot = process.argv[2]
  if (!privateRoot) throw new Error('D05_PRIVATE_ROOT_REQUIRED')
  const values = privateEnvironment(privateRoot), url = new URL(values.DIRECT_URL)
  const certificate = path.join(path.resolve(privateRoot), 'trusted-ca.pem')
  writeFileSync(certificate, rootCertificates.join('\n') + '\n')
  const r = spawnSync(path.join(process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin', 'psql.exe'),
    ['-h', D05_TARGET.host, '-p', '5432', '-U', D05_TARGET.role, '-d', D05_TARGET.database, '-w', '-X', '-c', '\\conninfo'],
    { encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: certificate, PGCONNECT_TIMEOUT: '15', PGCHANNELBINDING: 'require', LC_ALL: 'C' } })
  const info = sanitized(r.stdout, values)
  if (r.status !== 0 || r.error || !/TLSv1\.[23]/.test(info)) throw new Error('D05_LIBPQ_TLS_UNPROVEN')
  prisma = new PrismaClient({ datasourceUrl: values.DATABASE_URL, log: [] })
  const rows = await prisma.$queryRaw`SELECT current_database() AS db,current_user AS role`
  if (rows.length !== 1 || rows[0].db !== D05_TARGET.database || rows[0].role !== D05_TARGET.role) throw new Error('D05_TLS_TARGET_MISMATCH')
  const result = { at: new Date().toISOString(), projectId: 'super-credit-72834107', branchId: 'br-billowing-cake-b627zsxv',
    privateStateValidated: true, prisma: { connectedIdentity: rows[0], sslmode: 'require', sslaccept: 'strict', query: 'READ_ONLY_IDENTITY' },
    libpq: { sslmode: 'verify-full', channelBinding: 'require', clientConnectionInfo: info.trim(),
      certificateSource: 'NODE_24_BUNDLED_PUBLIC_ROOTS', certificateBundleSha256: createHash('sha256').update(readFileSync(certificate)).digest('hex') },
    backendSslViewNotUsedAsClientProof: true, productionAccess: false, physicalHomologation: 'PENDING' }
  writeFileSync('docs/print-004c-e2e/evidence/d05/authorized-environment/STRICT_TLS.json', JSON.stringify(result, null, 2) + '\n')
  console.log('D05_STRICT_TLS_VERIFIED')
} catch { console.error('D05_STRICT_TLS_UNPROVEN'); process.exitCode = 1 }
finally { if (prisma) await prisma.$disconnect() }
