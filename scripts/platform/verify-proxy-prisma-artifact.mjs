import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Verifica o pacote do proxy sem carregar Prisma nem abrir conexão de banco. */
export function verifyProxyPrismaArtifact(root = process.cwd()) {
  const generated = path.resolve(root, 'generated/prisma');
  const traceFile = path.resolve(root, '.next/server/middleware.js.nft.json');
  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  if (!Array.isArray(trace.files) || trace.files.some((file) => typeof file !== 'string')) {
    throw new Error('PROXY_PRISMA_TRACE_INVALID');
  }
  const engines = fs.readdirSync(generated).filter((file) => /query_engine-.*\.node$/.test(file));
  if (engines.length === 0) throw new Error('PROXY_PRISMA_ENGINE_MISSING');
  const traced = new Set(trace.files.map((file) => path.resolve(path.dirname(traceFile), file)));
  for (const file of [...engines, 'schema.prisma']) {
    const expected = path.join(generated, file);
    if (!traced.has(expected) || !fs.statSync(expected).isFile() || fs.statSync(expected).size === 0) {
      throw new Error('PROXY_PRISMA_ARTIFACT_INCOMPLETE');
    }
  }
  return { engines: engines.length, schema: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyProxyPrismaArtifact();
    console.log('PROXY_PRISMA_ARTIFACT_VERIFIED');
  } catch {
    // Não exportar caminhos, conteúdo de arquivos ou ambiente para o log do build.
    console.error('PROXY_PRISMA_ARTIFACT_INVALID');
    process.exitCode = 1;
  }
}
