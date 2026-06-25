---
title: ADR-0008 · Arquitetura oficial do módulo Fiscal (NFC-e/SAT/NF-e)
status: aceita
data: 2026-06-24
autor: Claude Opus (Fiscal Fase 1 — Arquitetura)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, nfce, arquitetura, snapshot, provider, fila, seguranca]
substitui:
superado_por:
---

# ADR-0008 · Arquitetura oficial do módulo Fiscal

> **Status:** aceita
> **Decisão em uma frase:** O módulo Fiscal do OmniGestão Pro é um **satélite pós-commit,
> assíncrono, provider-agnóstico e baseado em snapshot imutável** — o domínio comercial (venda)
> nunca depende, nunca espera e nunca é desfeito pelo domínio fiscal.

---

## 1. Contexto

A frente Fiscal saiu da Fase 0 com uma **fundação dormente madura** (GOALs 001B–008): schema
completo (8 modelos + 12 enums em `prisma/schema.prisma` ~L2072+), identidade fiscal por loja,
máquina de estados da venda, persistência fiscal do produto, snapshot congelado, abstração de
provider, pipeline de emissão simulado e numeração por série. Tudo **`simulado = true`** e
**desligado por padrão** (`ConfiguracaoFiscalLoja.fiscalEnabled = false`), sem nenhum chamador
no fluxo de venda (prova empírica em `AUDITORIA_PRE_FISCAL_READINESS_v01 §3`).

A próxima etapa é a parte difícil e arriscada: tributos → XML → assinatura A1 → transmissão
SEFAZ → QR-Code → DANFCE → eventos → ativação. **Antes** de escrever qualquer linha produtiva,
é preciso congelar os **princípios arquiteturais** que governam todas as fases F1–F12. Este ADR
é essa fonte de verdade. Sem ele, cada fase decidiria sozinha questões estruturais (síncrono vs
assíncrono, onde mora o segredo, se o XML pode ser recalculado) — e essas decisões, tomadas
tarde, custam retrabalho e risco fiscal/operacional.

**Restrições:**

- **Operacional:** o balcão (PDV) não pode travar nem ficar mais lento por causa do fiscal.
  Fechar uma venda é o caminho crítico do negócio; a SEFAZ não pode estar nele.
- **Legal:** o XML autorizado é um registro legal imutável; correções só por evento fiscal.
  Imposto calculado errado é passivo fiscal.
- **Segurança:** certificado A1 (`.pfx`) e CSC são segredos que, vazados, permitem emitir
  documento fiscal em nome do contribuinte. Nunca podem estar em claro em coluna, log ou bundle.
- **Multi-loja:** identidade/certificado/série/CSC/provider são por `storeId`, sem fallback
  `loja-1` (ADR-0003). Uma loja em produção não pode afetar as demais.
- **Governança:** áreas protegidas (schema, auth, proxy, core PDV/Financeiro) só mudam com
  autorização explícita; mudanças são aditivas e reversíveis (`CORE_RULES §5`).

**Estado atual relevante:**
- `docs/ai/CURRENT_STATUS.md` em 2026-06-24: fiscal listado como "NF-e — mock" (desatualizado
  vs GOALs 001B–008; correção é follow-up, não objeto deste ADR).
- `docs/roadmaps/ROADMAP_FISCAL.md` em 2026-06-24: Fase 0 concluída; próxima é F1 (ADR do cofre).
- `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`: plano F0–F12 com gates humanos.

---

## 2. Decisão

O módulo Fiscal adota **sete princípios inegociáveis**. Eles valem para toda fase F1–F12 e
qualquer fase nova só pode existir se os respeitar.

**P1 — Satélite pós-commit (nunca no caminho crítico).**
A venda **commita e fecha o caixa primeiro**. Só **depois**, fora da transação de venda, um
produtor enfileira a emissão em `FiscalEmissaoJob`. O PDV **enfileira**, nunca emite inline.

**P2 — Emissão assíncrona via fila (nunca síncrona).**
Toda transmissão à SEFAZ passa pela fila desacoplada `FiscalEmissaoJob` (lock/retry/dedupe).
Nenhum handler de request HTTP de venda aguarda resposta da SEFAZ.

**P3 — Snapshot imutável é a fonte única.**
No instante da venda, `buildVendaFiscalSnapshot` congela emitente/destinatário/itens/pagamento
(`deepFreeze`) e o serviço grava em `NotaFiscal`/`NotaFiscalItem`. Daí em diante **nenhuma
camada relê dado vivo** (Produto/Venda/Cliente). O documento fiscal é a foto do ato, não o
estado atual do sistema.

**P4 — XML nunca é recalculado.**
Uma vez gerado e assinado a partir do snapshot, o XML é serializado **uma vez**. Reprocessar
significa **retransmitir o mesmo XML**, jamais re-serializar a partir de dados atuais. XML
autorizado é registro legal imutável; toda alteração é **evento fiscal** (cancelamento, CC-e).

**P5 — Provider desacoplado (provider-agnóstico).**
Toda integração externa passa pelo contrato `FiscalProvider` (`lib/fiscal/provider/types.ts`).
Trocar `SEFAZ_DIRETO` por um gateway (Focus/PlugNotas/eNotas/NFE.io) ou vice-versa é trocar a
implementação registrada no `resolver.ts` — **não toca o pipeline** nem o domínio.

**P6 — Segredo só por referência.**
Certificado A1, senha do `.pfx`, CSC e token de gateway **nunca** ficam em coluna em claro,
log, trace ou bundle do cliente. O schema guarda apenas referências (`blobRef`, `senhaRef`,
`cscTokenRef`, `providerTokenRef`) a um cofre definido por ADR próprio (cofre = F1).

**P7 — Default-off e habilitação loja-a-loja.**
`fiscalEnabled` nasce `false`. A ativação é por loja, homologação antes de produção, em ondas.
`fiscalEnabled = false` é o **kill-switch**: para de enfileirar imediatamente, sem afetar
vendas em andamento nem o histórico.

**Detalhamento operacional:**
- **Separação de domínios.** Domínio **comercial** (Venda, Caixa, Financeiro, Estoque) e domínio
  **fiscal** (NotaFiscal, EventoFiscal, FiscalEmissaoJob, FiscalLog) se comunicam por **um único
  ponto**: o snapshot (comercial → fiscal) e o reflexo de status read-only (fiscal → comercial,
  via `Venda.fiscalStatus`). O fiscal **lê** o comercial uma vez (no snapshot) e nunca o escreve.
- **Única escrita de negócio do pipeline:** `Venda.fiscalStatus`. Tudo o mais que o pipeline
  produz é trilha (`FiscalLog`). Confirmado em `lib/fiscal/emission/emission.types.ts` (porta
  `setFiscalStatus`) e `emission-pipeline.ts`.
- **Idempotência em toda fronteira:** snapshot por `localKey` `nfce-snapshot:{store}:{venda}`;
  numeração por `(storeId, modelo, serie, ambiente)` atômica; nota vigente única por venda;
  job por `dedupeKey`; evento por `(nota, tipo, sequencia)`.

**O que esta decisão NÃO inclui (escopo fechado):**
- Não define **onde** mora o cofre de segredo (Vault × KMS × env). Isso é o **ADR da F1**.
- Não decide **provider real** (SEFAZ direto × gateway). Isso é o **Gate da F5**.
- Não implementa nada: este ADR é só decisão arquitetural. Implementação vai para sprints F1–F12.

---

## 3. Alternativas consideradas

| Alternativa | Prós | Contras | Por que não escolhida |
|---|---|---|---|
| **A) Emissão síncrona inline** na transação de venda | Status fiscal "na hora"; menos peças | Acopla balcão à SEFAZ; lentidão/timeout travam a venda; falha fiscal desfaz venda | Viola P1/P2 — risco operacional inaceitável no PDV |
| **B) Recalcular XML a cada tentativa** a partir do estado atual | "Sempre atualizado"; menos armazenamento | Quebra imutabilidade legal; reprocessar muda o documento; divergência se Produto/preço mudou | Viola P3/P4 — ilegal e não-determinístico |
| **C) Provider único (SEFAZ direto hardcoded)** | Sem custo de gateway; controle total | Trabalho por UF; difícil trocar; testes dependem de rede SEFAZ | Viola P5 — trava a estratégia; o enum já prevê 7 providers |
| **D) Segredo em coluna criptografada no Postgres** | Simples; tudo no banco | Chave de cripto acaba no app; backup do banco carrega segredo; difícil rotacionar | Viola P6 — segredo deve sair do banco; decisão fica para ADR da F1 |
| **E (escolhida)) Satélite assíncrono, snapshot imutável, provider-agnóstico, segredo por referência, default-off** | Balcão nunca trava; documento determinístico e legal; troca de provider barata; segredo isolado; adoção gradual segura | Mais peças (fila/worker/cofre); status fiscal eventual, não imediato | — |

---

## 4. Consequências

### 4.1 Positivas
- **Balcão imune:** ativar o fiscal não muda o tempo de fechamento da venda (P1/P2).
- **Documento determinístico e auditável:** o mesmo snapshot sempre gera o mesmo XML (P3/P4).
- **Flexibilidade de fornecedor:** trocar SEFAZ-direto ↔ gateway sem tocar pipeline/domínio (P5).
- **Postura de segurança forte:** segredo nunca em claro; superfície de vazamento mínima (P6).
- **Adoção sem risco sistêmico:** loja-a-loja, homologação antes de produção, kill-switch (P7).

### 4.2 Negativas / Custos
- **Status fiscal é eventual**, não imediato: o PDV mostra "emitindo/pendente" até o worker
  concluir. Exige UX que comunique isso (reflexo read-only de `Venda.fiscalStatus`).
- **Mais infraestrutura:** produtor + worker + cofre + observabilidade da fila.
- **Armazenamento do XML:** guardar XML autorizado/assinado (e ref de storage) por documento.

### 4.3 Riscos introduzidos
- **Job preso em dead-letter** (tentativas esgotadas) → mitigação: política de `maxTentativas`,
  painel sobre `FiscalEmissaoJob`/`FiscalLog`, reprocessamento manual (detalhe em `FISCAL_EVENTS.md`).
- **Divergência snapshot × realidade** se alguém "consertar" relendo dado vivo → mitigação: P3/P4
  explícitos; provider proibido de reler Produto/Venda (já garantido no contrato atual).
- **Cofre mal escolhido** trava a assinatura (F4) → mitigação: ADR da F1 é Gate humano obrigatório.

### 4.4 O que muda imediatamente
- **Arquivos afetados:** apenas documentação (este ADR + 5 docs de arquitetura + plano mestre).
  **Nenhum código produtivo.**
- **Docs a atualizar:** `docs/architecture/INDEX.md` (linkar os novos docs),
  `docs/decisions/INDEX.md` (registrar este ADR), `MASTER_FISCAL_EXECUTION_PLAN.md` (referenciar).
- **Outras decisões afetadas:** ADR-0003 (multi-loja sem fallback) é pré-requisito herdado;
  o ADR do cofre (F1) e a decisão de provider (F5) ficam **subordinados** a este.

### 4.5 O que muda no longo prazo
- Todas as fases F1–F12 passam a ter **critério de conformidade arquitetural**: uma fase que
  fira P1–P7 é rejeitada no Gate, independentemente de "funcionar".
- O módulo fiscal vira um **bloco substituível**: trocar de gateway ou de cofre é uma sprint
  isolada, não um refactor transversal.

---

## 5. Plano de implementação

**Esta decisão é só decisão — implementação vai para as sprints F1–F12.**

- Sprints sugeridas: F1 (ADR cofre) → F2 (tributos) → F3 (XML) → F4 (assinatura) → Dry-Run →
  F5 (SEFAZ) → F6 (QR) → F7 (ativação) → F8 (DANFCE) → F9 (eventos) → F10 (contingência) →
  F11 (homologação ampla) → F12 (produção). Detalhe em `MASTER_FISCAL_EXECUTION_PLAN.md §3`.
- Owner humano: Rafael Faria.
- Pré-requisitos: nenhum para este ADR; F4 depende do ADR do cofre (F1).
- Critério de pronto da implementação de cada fase: ver DoD transversal no plano mestre §5.

---

## 6. Validação / como saberemos que deu certo

- **Métrica 1 — balcão:** tempo extra de fechamento da venda por causa do fiscal ≈ 0 ms
  (emissão fora da transação). Janela: contínua a partir da F7.
- **Métrica 2 — determinismo:** reprocessar um job nunca re-serializa XML (auditável em
  `FiscalLog`: a ação de "reprocessar" referencia o mesmo `chaveAcesso`/`xmlAssinado`).
- **Métrica 3 — segredo:** 0 ocorrências de `.pfx`/senha/CSC em log/bundle/coluna (auditável).
- **Métrica 4 — conformidade:** toda fase F1–F12 mergeada passou pelo checklist P1–P7 no Gate.
- Janela de observação: por fase, no respectivo Gate #2.

---

## 7. Referências

- ADRs relacionados: **ADR-0003** (eliminar fallback `loja-1` — pré-requisito multi-loja),
  **ADR-0007** (modelo de depósitos — padrão "aditivo+dormente" precedente).
- Auditorias relacionadas: `docs/audits/AUDITORIA_PRE_FISCAL_READINESS_v01.md`,
  `docs/audits/AUDITORIA_FISCAL_GAPS_v01.md`.
- Arquitetura derivada deste ADR: `docs/architecture/FISCAL_SCHEMA_DESIGN.md`,
  `docs/architecture/NFCE_ARCHITECTURE.md`, `docs/architecture/FISCAL_EVENTS.md`,
  `docs/architecture/FISCAL_SECURITY.md`, `docs/architecture/FISCAL_DRY_RUN.md`.
- Governança: `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`, `docs/roadmaps/ROADMAP_FISCAL.md`.
- Código vivo (fundação dormente): `lib/fiscal/**`, `prisma/schema.prisma` (~L2072+).

---

## 8. Notas / discussão

- **Por que "satélite" e não "módulo de primeira classe no fluxo de venda":** porque a venda é
  o ativo do negócio e a SEFAZ é uma dependência externa instável. Acoplar os dois é trocar a
  confiabilidade do balcão pela conveniência de um status imediato. A troca não compensa.
- **Por que o snapshot é imutável e não "a venda atual":** porque uma venda pode ser corrigida
  (preço, cliente, item) **depois** de emitida; se o XML lesse a venda viva, dois documentos com
  a mesma chave divergiriam. O snapshot resolve isso por construção — e a máquina de estados
  (`venda-fiscal-state-machine.ts`) já bloqueia correção de venda com nota `AUTORIZADA`.
- **Por que provider-agnóstico desde o dia zero:** o custo de definir o contrato cedo é baixo
  (já pago no GOAL_006); o custo de acoplar e depois desacoplar é alto. A decisão SEFAZ-direto
  × gateway é estratégica (custo recorrente × esforço por UF) e fica explicitamente para a F5.
- **Trade-off aceito:** status fiscal eventual em troca de balcão imune. O humano dono do
  projeto aprovou essa troca como princípio fundador da frente.
