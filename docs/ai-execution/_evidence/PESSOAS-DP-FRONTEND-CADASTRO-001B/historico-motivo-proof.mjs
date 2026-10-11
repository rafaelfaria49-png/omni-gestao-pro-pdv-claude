import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Narrow synthetic DTO boundary proof; no database, auth session, or storage.
// Runs the actual reader body, replacing only its external dependencies.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const source = fs.readFileSync(path.join(root, 'lib/pessoas/cadastro.ts'), 'utf8');
const start = source.indexOf('export async function listarHistorico(');
const end = source.indexOf('\nexport async function vincularIdentidade(', start);
assert.ok(start >= 0 && end > start, 'reader boundaries must match');
const reader = stripTypeScriptTypes(source.slice(start, end).replace('export ', ''));
const sentinel = 'SYNTHETIC_SALARY_9876.54';
const date = new Date('2026-10-01T00:00:00.000Z');
let authorizationChecked = false;
const context = vm.createContext({
  exigirEscopo: async (id, capability) => {
    assert.equal(id, 'synthetic-employer');
    assert.equal(capability, 'viewCadastro');
    authorizationChecked = true;
    return { empregadorId: id, storeId: 'synthetic-store', capacidades: ['viewCadastro'] };
  },
  prisma: { dpVinculo: { findFirst: async ({where}) => {
    assert.equal(where.empregadorId, 'synthetic-employer');
    assert.equal(where.storeId, 'synthetic-store');
    return {
      pessoa: { versoes: [] },
      contratos: [{ id: 'synthetic-contract', versao: 1, cargo: 'Sintetico', cbo: null,
        salarioBase: { toFixed: () => '9876.54' }, validFrom: date, validTo: null,
        recordedAt: date, supersedesId: null, supersededAt: null,
        autorId: 'synthetic-author', motivo: `Ajuste salarial: ${sentinel}` }],
    };
  } } },
  dataCivilDto: (value) => value ? value.toISOString().slice(0, 10) : null,
});
vm.runInContext(`${reader}\nglobalThis.runReader = listarHistorico;`, context);
const dto = await context.runReader('synthetic-employer', 'synthetic-link');
assert.equal(authorizationChecked, true);
assert.equal(dto.contratos[0].salarioBase, null);
assert.equal(dto.contratos[0].remuneracaoOculta, true);
assert.equal(dto.contratos[0].motivo.includes(sentinel), true);
const result = {
  proof: 'SYNTHETIC_DTO_BOUNDARY_ONLY',
  source_sha256: createHash('sha256').update(source).digest('hex'),
  viewRemuneracao: false, salarioBase: null, remuneracaoOculta: true,
  salary_sentinel_leaked_in_motivo: true,
  database_accessed: false, production_accessed: false,
  integration_test: false, official_runner: 'NOT_RUN',
};
fs.writeFileSync(path.join(here, 'historico-motivo-proof.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
