<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024",
  "track": "fiscal",
  "title": "Auditoria e readiness da terceira tentativa corrigida NFC-e em homologação; zero transmissão",
  "status": "READY",
  "class": "C3",
  "branch": "goal/fiscal-024-corrected-retry-readiness",
  "worktree": "C:/workspace",
  "test_command": "npx vitest run lib/fiscal/xml lib/fiscal/signing lib/fiscal/provider/sefaz lib/fiscal/homologation lib/fiscal/queue test/fiscal/scenario-battery",
  "allowlist": [
    "docs/ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024.md",
    "docs/execution-tracks/fiscal/**",
    "docs/execution-tracks/REGISTRY.md"
  ],
  "gates_liberados": [],
  "read_budget": 180,
  "revisao_independente": true,
  "familia_executor": "openai",
  "risk_tier": "ALTO",
  "reversibilidade": "alta",
  "plan_ref": "FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001",
  "plan_rev": 1,
  "gates_extra": [
    "G-F7 permanece fechado; nenhuma ativação",
    "G-F12 permanece fechado; produção fiscal proibida"
  ],
  "authorization_source": "Autorização humana anexada em 2026-10-01: retomada do mesmo GOAL 024; obtenção efêmera dos envs Production dos projetos Vercel omni-gestao e omni-gestao-pro exclusivamente para identificar a base canônica; transações PostgreSQL READ ONLY e SELECT/read queries de auditoria; documentação, commit e push. Proibidas escritas DB, alterações fiscais, ativação, janela, emissão/retry, POST SEFAZ, G-F7, G-F12, Production fiscal e merge."
}
-->

# FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024

## Execução governada

A classificação READY do AEP habilita somente a auditoria acima; não representa readiness de transmissão. Nenhum gate fiscal é liberado. O acesso ao banco exige URL canônica já disponível e operações exclusivamente READ-ONLY. Se não houver acesso, registrar BLOCKED_BY_READONLY_DB_ACCESS, interromper a auditoria e ratificar o bloqueio com track.mjs block, sem afirmar DONE. Revisão independente R é necessária antes de eventual conclusão bem-sucedida; não presumir R. Nenhum código produtivo, schema, migration, arquivo de ambiente ou dado fiscal pode ser alterado.

A allowlist de governança existe para operações canônicas do AEP; state.json, LEDGER.jsonl e REGISTRY.md nunca são editados manualmente. O teste canônico é o comando ratificado do GOAL 023. Um bloqueio de acesso anterior aos testes deve ficar explícito como NOT_RUN, jamais PASS.

## Pedido humano integral

GOAL: FISCAL-PILOT-HOMOLOGATION-CORRECTED-RETRY-READINESS-024

Objetivo:
preparar e auditar a terceira tentativa controlada do piloto NFC-e em
HOMOLOGAÇÃO após a correção D01e/cStat 588 do GOAL 023.

ESTA ETAPA NÃO AUTORIZA TRANSMISSÃO.

Zero POST SEFAZ.
Zero emissão NFC-e.
Zero Produção.
Zero ativação G-F7.
G-F12 permanece fechado.

CONTEXTO CANÔNICO

origin/main esperado:
bfbdf01087433738134f5ee308475c2ef9841fbe

GOAL 023:
CLOSED_AND_MERGED

Node Vercel:
24.x

Production deploy:
READY

Último piloto real 022E:

loja:
loja-1

ambiente:
HOMOLOGACAO

provider:
SEFAZ_DIRETO

modelo:
NFCE

resultado da emissão:
cStat 588

consulta posterior:
217 / NOT_FOUND

A correção do 023 eliminou whitespace D01e entre tags,
preservou XMLDSig/XSD e adicionou backstop fail-closed.

A semântica versionada do 588 determina:
REJECTED
numeroConsumido=false
requiresInutilizacao=false
requiresConsultation=false
zero retry automático

A fonte oficial versionada admite correção e nova transmissão
com o mesmo número e série após rejeição.

1. PREPARAR WORKTREE

A worktree C:\workspace pode ser reutilizada SOMENTE se estiver limpa
e a branch antiga do 023 já estiver publicada/mergeada.

Rode:

git status --short
git fetch origin
git rev-parse origin/main
git branch --show-current

Se limpa, crie branch nova diretamente da main atual:

goal/fiscal-024-corrected-retry-readiness

Não resetar.
Não rebasear.
Não reutilizar a branch do 023.

Materialize o novo GOAL pela governança AEP vigente.
Não editar state/ledger/registry manualmente.

2. CONFIRMAR BASE PUBLICADA

Prove na main:

- merge do PR #222 presente;
- merge do PR #228 presente;
- package.json engines.node = 24.x;
- D01e compact serializer presente;
- D01e backstop presente;
- matriz 588 presente;
- testes 588 presentes.

Registre SHAs.

3. RECONSTRUIR O ESTADO DO PILOTO 022E

Use as evidências versionadas do 022E como fonte.

Identificadores históricos conhecidos:

PRODUCT_ID=cmubufygs0001h2mcjk4ws5p1
SALE_ID=cmubufz1v000ch2mc5fknbpy6
CAIXA_ID=cmubufytz000ah2mcib062l0n
NOTA_ID=cmubufzhb000mh2mcvwan5e2m
JOB_ID=cmubufzmf000ph2mcu6act9zk
CHNFE=35260948241205000195650010000000021026842710

Não imprimir segredo algum.

4. AUDITORIA READ-ONLY DO BANCO

Se DATABASE_URL / DIRECT_URL canônicas já estiverem disponíveis
na sessão, use somente operações READ-ONLY.

Não executar UPDATE/INSERT/DELETE/UPSERT.
Não abrir caixa.
Não criar venda.
Não criar NotaFiscal.
Não criar job.

Confirme no banco:

- alvo realmente é a base canônica esperada;
- loja = loja-1;
- ambiente fiscal = HOMOLOGACAO;
- provider = SEFAZ_DIRETO;
- modeloFiscal = NFCE;
- cscId = 4;
- cscTokenRef = FISCAL_CSC_TOKEN_LOJA_1;
- fiscalEnabled = false;
- nenhuma janela de transmissão armada;
- Production fiscal = false.

Para NOTA_ID/JOB_ID anteriores, registre somente campos não secretos:

- status;
- operação;
- tentativas;
- cStat/result;
- número;
- série;
- chave;
- timestamps relevantes;
- se ainda existe retry pendente;
- se existe qualquer estado UNCERTAIN;
- se algum job está RUNNING/PENDING.

Exija:

NO_PENDING_AUTOMATIC_RETRY=true
NO_UNCERTAIN_STATE=true

Se credenciais READ-ONLY não estiverem disponíveis:
não invente resultado.
Pare em BLOCKED_BY_READONLY_DB_ACCESS.

5. NUMERAÇÃO APÓS 588

Audite código + persistência e responda mecanicamente:

- o número/série da rejeição 588 pode ser reutilizado pelo caminho real?
- o allocator atual tentaria reservar número novo?
- existe unique constraint/guard que impeça reconstrução correta?
- a NotaFiscal antiga deve permanecer imutável?
- a terceira tentativa exige nova NotaFiscal/job com lineage
  ou reutilização controlada do registro anterior?
- qual é o caminho canônico já existente para isso?

Não implementar ainda mudança estrutural.

Não escolher nova numeração apenas para contornar o problema.

Se o runtime não consegue executar corretamente a política
"mesmo número/série após rejeição não gravada",
classifique como BLOCKER e proponha micro-GOAL antes da transmissão.

6. AUDITAR O CAMINHO REAL DE TRANSMISSÃO

Mapeie exatamente a chamada produtiva/homologação que faria a terceira tentativa:

fonte do documento
→ snapshot
→ XML
→ compact serialization
→ XMLDSig
→ XSD
→ D01e backstop
→ enviNFe
→ provider
→ one-shot transmission authority

Confirme que o backstop atua imediatamente antes da fronteira SOAP.

Confirme que não existe caminho alternativo que use bytes pretty.

7. PROVA OFFLINE DO FIX

Sem contato externo, execute testes focados:

npx vitest run lib/fiscal/xml/cstat588-compact-message.test.ts
npx vitest run lib/fiscal/xml/cstat588-produtores-compactos.test.ts
npx vitest run lib/fiscal/provider/sefaz/sefaz-cstat-matrix.test.ts
npx vitest run lib/fiscal/provider/sefaz/sefaz-envelope.test.ts

Depois rode o comando canônico do GOAL 023 para regressão.

Garanta xmllint real disponível no PATH.

Exija:

D01E_INTERTAG_WHITESPACE=0
XMLDSIG_VALID=true
XSD_VALID=true
CSTAT588_POLICY=true
AUTO_RETRY_588=false

8. CANDIDATO DA TERCEIRA TENTATIVA

Determine, sem transmitir, qual seria o candidato correto.

Registre:

CANDIDATE_NUMBER=
CANDIDATE_SERIES=
CANDIDATE_CHNFE_EXPECTED=
CANDIDATE_REUSES_REJECTED_NUMBER=
CANDIDATE_SOURCE_PATH=
CANDIDATE_JOB_STRATEGY=

Não persistir o candidato se isso exigir escrita no banco.

Se preparar o candidato exigir escrita real,
apenas descreva exatamente a operação necessária
e deixe para o próximo gate.

9. CONTENÇÃO

Confirme antes de finalizar:

fiscalEnabled=false
PRODUCTION=false
TRANSMISSION_WINDOW_ARMED=false
EXTERNAL_SEFAZ_CONTACT=false
SEFAZ_SOAP_POST_COUNT=0
REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0

10. DOCUMENTAÇÃO / EVIDÊNCIA

Produza evidência sanitizada do GOAL 024 contendo:

- base/versionamento;
- estado read-only da tentativa anterior;
- política de numeração;
- caminho canônico da terceira tentativa;
- resultado dos testes offline;
- blockers;
- candidato proposto;
- confirmação de zero transmissão.

Não registrar segredo, certificado, senha ou token.

11. CRITÉRIO PARA GATE HUMANO

Só classificar READY_FOR_THIRD_ATTEMPT_GATE se TODOS forem verdadeiros:

GOAL_023_DEPLOYED=true
DATABASE_STATE_VERIFIED=true
NO_PENDING_AUTOMATIC_RETRY=true
NO_UNCERTAIN_STATE=true
NUMBER_REUSE_POLICY_VERIFIED=true
D01E_INTERTAG_WHITESPACE=0
XMLDSIG_VALID=true
XSD_VALID=true
CSTAT588_POLICY=true
AUTO_RETRY_588=false
FISCAL_ENABLED=false
PRODUCTION=false
EXTERNAL_SEFAZ_CONTACT=false

Se qualquer item falhar:
não solicitar autorização de transmissão.

12. COMMIT / PUSH

Se houver apenas documentação/evidência/AEP do readiness,
commit e push na branch do GOAL 024 conforme protocolo.

Não mergear automaticamente.
Não transmitir.

13. PONTO DE PARADA

Se pronto:

AWAITING_THIRD_HOMOLOGATION_ATTEMPT_AUTHORIZATION

Apresente a autorização proposta, mas NÃO a execute.

RELATÓRIO

GOAL=
BASE_MAIN=

GOAL_023_PRESENT=
NODE24_PRESENT=

DATABASE_STATE_VERIFIED=
STORE=
AMBIENTE=
PROVIDER=
MODELO=
FISCAL_ENABLED=
PRODUCTION=

OLD_NOTA_STATUS=
OLD_JOB_STATUS=
OLD_CSTAT=
OLD_CONSULTA_RESULT=
OLD_NUMBER=
OLD_SERIES=
OLD_CHNFE=

NO_PENDING_AUTOMATIC_RETRY=
NO_UNCERTAIN_STATE=

NUMBER_REUSE_POLICY_VERIFIED=
CANDIDATE_NUMBER=
CANDIDATE_SERIES=
CANDIDATE_CHNFE_EXPECTED=
CANDIDATE_REUSES_REJECTED_NUMBER=
CANDIDATE_JOB_STRATEGY=

D01E_INTERTAG_WHITESPACE=
XMLDSIG_VALID=
XSD_VALID=
CSTAT588_POLICY=
AUTO_RETRY_588=

EXTERNAL_SEFAZ_CONTACT=false
SEFAZ_SOAP_POST_COUNT=0
REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0

BLOCKERS=
FINAL_DECISION=

STOP:
AWAITING_THIRD_HOMOLOGATION_ATTEMPT_AUTHORIZATION
