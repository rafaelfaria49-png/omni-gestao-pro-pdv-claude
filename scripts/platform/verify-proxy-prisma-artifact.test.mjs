import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyProxyPrismaArtifact } from './verify-proxy-prisma-artifact.mjs';

function fixture(t, engine = 'libquery_engine-rhel-openssl-3.0.x.so.node') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-proxy-artifact-'));
  t.after(() => {
    const target = fs.realpathSync(root);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep + 'omni-proxy-artifact-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const generated = path.join(root, 'generated/prisma');
  const trace = path.join(root, '.next/server/middleware.js.nft.json');
  fs.mkdirSync(generated, { recursive: true });
  fs.mkdirSync(path.dirname(trace), { recursive: true });
  for (const file of [engine, 'schema.prisma']) fs.writeFileSync(path.join(generated, file), 'synthetic fixture');
  const manifest = (files) => fs.writeFileSync(trace, JSON.stringify({ version: 1, files }));
  const relative = (file) => path.relative(path.dirname(trace), path.join(generated, file));
  manifest([relative(engine), relative('schema.prisma')]);
  return { root, generated, engine, trace, manifest, relative };
}

test('aceita engine Linux e schema presentes no NFT final do proxy', (t) => {
  assert.deepEqual(verifyProxyPrismaArtifact(fixture(t).root), { engines: 1, schema: true });
});
test('aceita a mesma prova com engine Windows', (t) => {
  const f = fixture(t, 'query_engine-windows.dll.node');
  assert.deepEqual(verifyProxyPrismaArtifact(f.root), { engines: 1, schema: true });
});
test('rejeita engine disponível no checkout mas omitido do pacote', (t) => {
  const f = fixture(t); f.manifest([f.relative('schema.prisma')]);
  assert.throws(() => verifyProxyPrismaArtifact(f.root), /ARTIFACT_INCOMPLETE/);
});
test('rejeita engine homônimo de outro diretório', (t) => {
  const f = fixture(t); f.manifest(['../../other/' + f.engine, f.relative('schema.prisma')]);
  assert.throws(() => verifyProxyPrismaArtifact(f.root), /ARTIFACT_INCOMPLETE/);
});
test('rejeita ausência do schema gerado que ancora a localização do engine', (t) => {
  const f = fixture(t); f.manifest([f.relative(f.engine)]);
  assert.throws(() => verifyProxyPrismaArtifact(f.root), /ARTIFACT_INCOMPLETE/);
});
test('rejeita manifesto que aponta para arquivo nativo removido', (t) => {
  const f = fixture(t); fs.unlinkSync(path.join(f.generated, f.engine));
  assert.throws(() => verifyProxyPrismaArtifact(f.root), /ENGINE_MISSING/);
});
test('rejeita biblioteca vazia e manifesto malformado', (t) => {
  const f = fixture(t); fs.writeFileSync(path.join(f.generated, f.engine), '');
  assert.throws(() => verifyProxyPrismaArtifact(f.root), /ARTIFACT_INCOMPLETE/);
  f.manifest([null]);
  assert.throws(() => verifyProxyPrismaArtifact(f.root), /TRACE_INVALID/);
});
