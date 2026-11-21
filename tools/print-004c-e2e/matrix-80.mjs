/**
 * Builds the 80-case acceptance table for OMNI-PRINT-004C from the 003 contract (MATRIZ_ACEITE.md ids/titles) and
 * the evidence of this candidate. Classes: PASS_REAL_SOFTWARE, PASS_SIMULATED_TRANSPORT, DEFERRED_PHYSICAL_HARDWARE,
 * BLOCKED_HUMAN_GATE, FAIL. Usage: node tools/print-004c-e2e/matrix-80.mjs <path to MATRIZ_ACEITE.md>
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const source = readFileSync(process.argv[2], "utf8")
const titles = new Map([...source.matchAll(/^\| *([PBIF]\d{2}) *\| *([^|]+?) *\|/gm)].map(m => [m[1], m[2]]))
const R = "PASS_REAL_SOFTWARE", S = "PASS_SIMULATED_TRANSPORT", D = "DEFERRED_PHYSICAL_HARDWARE", H = "BLOCKED_HUMAN_GATE"
const E = {
  P01: [R, "S02 (uiContextId diferente por envelope → mesmo job); ressalva histórica resolvida"],
  P02: [R, "S22 (REQUEST_CONFLICT com comando alterado)"],
  P03: [R, "unit P03 + S19 (ESC/GS/DLE/C0/C1/DEL/bidi inertes; NUL recusado pelo PostgreSQL)"],
  P04: [R, "S28/PW8 (HTML do navegador gerado e escapado no servidor, sem script) + S19"],
  P05: [R, "unit 58/80 (≤32/≤48 colunas, WPC1252 ã/ç/É, ESC t 16) + S03; aparência no papel em F02"],
  P06: [R, "unit P06 (duas renderizações byte a byte) + S23 (imutabilidade); ressalva histórica resolvida"],
  P07: [R, "unit P07 (ACEITO+INCERTO → PARCIAL sem retry da incerta) + S26; ressalva histórica resolvida"],
  P08: [R, "S23 (transições/imutabilidade/exclusão recusadas no banco) + R4"],
  P09: [R, "unit (INITIAL/REPRINT sem pulso de gaveta; validador recusa ESC p); teste sintético não exposto"],
  P10: [R, "S05/PW2 (venda pendente nunca imprime) + S22 (quarentena) + S14"],
  P11: [R, "S21 (COMMAND_LIMIT/SNAPSHOT_LIMIT/PAYLOAD_LIMIT/ITEM_LIMIT, zero efeitos) + S18; ressalva histórica resolvida"],
  P12: [R, "S15 (sessionVersion/usuário inativo/delegação → AUTHORIZATION_LOST); D03 R02/R07 (identidades mantidas após expurgo; requisição vencida não executa)"],
  P13: [R, "S19 (CPF fora do snapshot; nenhuma credencial/cipher na resposta)"],
  P14: [R, "S24 (segunda via de venda sem job anterior fecha o slot INITIAL)"],
  P15: [R, "unit (payload expirado não permite retry) + retry() exige payload vigente"],
  P16: [R, "S02 (dois usuários autorizados convergem no mesmo INITIAL)"],
  B01: [R, "S02 (duas criações INITIAL concorrentes → 1 job)"],
  B02: [R, "S02 + PW5 (abas/usuários/manual×auto convergem)"],
  B03: [R, "S03 (outro terminal converge) + S30 (TERMINAL_MISMATCH para venda de outro caixa)"],
  B04: [R, "S09 (POST reenviado) + S13 (consentimento repetido converge)"],
  B05: [R, "S22 (chave conhecida com outra identidade → REQUEST_EXPIRED)"],
  B06: [R, "S21 (falha antes do commit T1 deixa zero linhas)"],
  B07: [S, "S10/PW6 (sem T3: lease vence → não enviado, retry explícito imprime uma vez)"],
  B08: [S, "S25 + two-agents.pg (2 processos reais, mesma credencial, perdas de resposta, kill -9: 0 duplicatas em 3 execuções)"],
  B09: [S, "S10/S12 (lease vencido: nada é reivindicável, sem impressão tardia)"],
  B10: [S, "S11/S12 + two-agents + D04 recovery: kill real, UNKNOWN durável, PID reaproveitado, host órfão e nenhuma duplicata; papel D05 pendente"],
  B11: [R, "S15 (revogação antes da T3 → cópia expirada, nada enviado; sequencial)"],
  B12: [R, "S14 (cancelamento/correção após o job → cópia cancelada)"],
  B13: [R, "S04 (vínculos/agentes/provas de outra loja recusados)"],
  B14: [R, "S25 (duas confirmações concorrentes da segunda via → 1 job)"],
  B15: [S, "S26 (2 vias: aceite + falha → PARCIAL; retry só da não enviada)"],
  B16: [R, "S22 (UNKNOWN tardio não rebaixa; NO_EFFECT após aceite → RESULT_CONFLICT) + S09"],
  B17: [R, "D03 R01/R02/R04/R05/R09/R10/R11: conteúdo após 7 dias do término comprovado; dedup/provas permanentes, UNKNOWN preservado; concorrência/rollback/retomada"],
  B18: [R, "D03-A: nenhuma remoção de tombstone; R02/R07/R12 (command expurgado sem apagar requestKey; papel sem DELETE)"],
  B19: [R, "D03 R02/R03/R16: marca de primeira via permanente após expurgo; replay converge; segunda via autorizada reconstrói a venda"],
  B20: [R, "eventos por transição; S21/S23 (rollback integral, sem auditoria parcial)"],
  B21: [S, "S19/S26 (um destino admite uma tentativa por vez; fila serializada)"],
  B22: [R, "S24 (REPRINT histórico fecha INITIAL; sequencial)"],
  B23: [R, "S24 + D03 R16 (INITIAL após REPRINT histórico e expurgo continua recusado)"],
  B24: [R, "S26 (via substituída não volta) + S28 (navegador cancela vias térmicas seguras)"],
  B25: [S, "S07/S12/S29 (destino retido até prova; outro job aguarda)"],
  B26: [H, "D01.5: A4/legado não migrado ao ledger; alternativa do navegador é registrada (S28/PW8/PW9)"],
  I01: [R, "S22 (A01/PLATFORM com loja explícita)"],
  I02: [R, "S01/PW1 (STORE autorizado)"],
  I03: [R, "S15 (papel técnico/inativo/sessão) + S22 (módulo removido)"],
  I04: [R, "S04 (leitor escopado por loja; venda de outra loja → 404)"],
  I05: [R, "S05/S14/S22 (inexistente/pendente/cancelada/quarentena)"],
  I06: [R, "S22 (terminal inativo → TERMINAL_UNAVAILABLE) + S30 (navegador não autorizado → DEVICE_NOT_AUTHORIZED)"],
  I07: [R, "S22 (código de pareamento de uso único) + S16 (token inválido/revogado)"],
  I08: [S, "S04 (dois agentes/lojas) + S03 (dois terminais na loja)"],
  I09: [S, "unit PRINTER_NOT_FOUND + S16 (revogar/parear novo computador)"],
  I10: [R, "S16 (instalação revogada derruba vínculos; antes da T3 → BINDING_CHANGED)"],
  I11: [R, "S15 (STORE_CONTEXT_CONFLICT) + geração/descartes no cliente"],
  I12: [H, "G-AUTH: logout comum não incrementa sessionVersion (revogação por sessionVersion = PASS em S15; ACK atrasado após revogação registrado sem reenvio = PASS em S31); decisão em DECISOES_PROPRIETARIO_OMNI_PRINT.md"],
  I13: [R, "S18 (host/porta/bytes/URL/HTML recusados como campos desconhecidos)"],
  I14: [R, "S15 (Origin/CSRF) + S04 (consultas cruzadas)"],
  I15: [S, "S09 (resposta HTTP perdida em claim/report)"],
  I16: [S, "S06/S07/S08/PW3 (falha comprovada antes do envio)"],
  I17: [S, "S12 (consulta 'não encontrado no diário' mantém UNKNOWN, zero reenvio); ressalva histórica resolvida"],
  I18: [D, "cancelamento na fila do Windows exige fila real; nenhuma ação de cancelar após aceite é oferecida"],
  I19: [S, "unit (pausada/sem papel/erro/não encontrada) + host PowerShell real (inventário, status, OpenPrinter inexistente)"],
  I20: [D, "entrega tardia pela fila offline do Windows só é observável com impressora física"],
  I21: [R, "S13/S24"],
  I22: [R, "S20/S29/PW9 (segunda via após incerto; nada reenviado sozinho)"],
  I23: [R, "PW8/PW9/S28 (navegador só por clique, registrado, SEGUNDA VIA quando aplicável); papel em F07"],
  I24: [R, "unit (nenhuma via com gaveta)"],
  I25: [R, "S20 + PW1 (digest de todas as tabelas comerciais inalterado)"],
  I26: [R, "S18 (rate limit) + S15 (grant invalidado) + unit (payload expirado)"],
  I27: [R, "unit (token adulterado/domínio errado) + S04 (prova de outra instalação → 403) + S16"],
  I28: [R, "S13/S28 (risco descoberto pelo servidor; sem previousJobId)"],
  I29: [R, "S27 (consentimento obsoleto) + S29 (risco muda na T3 → RISK_CHANGED)"],
  I30: [R, "S26 (via substituída + callback antigo 'sem efeito' segue sem retry)"],
  I31: [H, "D01.5: A4 lógico não exposto no ledger 004C"],
  F01: [D, "automatizado só em Chromium (Playwright); Windows+Chrome/Edge com impressora pendente"],
  F02: [D, "perfis 58/80 validados em bytes; papel real pendente"],
  F03: [D, "frio/quente, reinício, desligamento e falta de papel com impressora real"],
  F04: [D, "duas vias e resposta perdida reais"],
  F05: [D, "fila padrão trocada/removida e vínculo revogado com fila real"],
  F06: [D, "gaveta desligada verificada em bytes; teste físico pendente"],
  F07: [D, "impressão do navegador em Chrome/Edge com impressora real"],
}
const rows = [...titles].map(([id, title]) => ({ id, title, status: E[id]?.[0] ?? "FAIL", evidence: E[id]?.[1] ?? "SEM EVIDÊNCIA" }))
if (rows.length !== 80) throw new Error("expected 80 ids, got " + rows.length)
const totals = rows.reduce((a, r) => (a[r.status] = (a[r.status] ?? 0) + 1, a), {})
const out = path.join(root, "docs/print-004c-e2e")
writeFileSync(path.join(out, "matriz-80.json"), JSON.stringify({ totals, rows }, null, 2))
writeFileSync(path.join(out, "MATRIZ_80.md"), `# Matriz de 80 casos — OMNI-PRINT-004C\n\nTotais: ${Object.entries(totals).map(([k, v]) => `${k}=${v}`).join(" · ")}\n\n` +
  "Nenhum PASS_SIMULATED_TRANSPORT é impressão física. Cenários S## = tools/print-004c-e2e/scenarios.pg.test.ts; PW# = e2e/specs/print-direct-004c.spec.ts; unit = lib/printing/direct/*.test.ts e tools/omni-print-agent/*.test.ts. D04: tools/print-d04/recovery.test.ts, D04_WINDOWS_AGENT.md e evidence/d04/; hardware/logon/reboot reais no RUNBOOK_D05.md permanecem pendentes.\n\n" +
  "| ID | Caso | Resultado | Evidência |\n|---|---|---|---|\n" + rows.map(r => `| ${r.id} | ${r.title} | ${r.status} | ${r.evidence} |`).join("\n") + "\n")
console.log(JSON.stringify(totals))
