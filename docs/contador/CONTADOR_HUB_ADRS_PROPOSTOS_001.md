# CONTADOR HUB — ADRs PROPOSTAS

| Campo | Valor |
|---|---|
| GOAL de origem | CONTADOR-HUB-FABLE5-MASTERPLAN-001 |
| Data | 2026-07-11 |
| Status de todas as ADRs | **Proposed** — nenhuma decisão está aprovada até autorização explícita de Rafael |
| Convenção | Ao aprovar, o GOAL correspondente muda o status para Accepted no mesmo branch e registra a data |

---

## ADR-CONTADOR-001 — Competência viva versus snapshot congelado

**Contexto.** O preview trata competência como estado React; o Financeiro já possui `FechamentoFinanceiro` com snapshot DRE e reabertura; o contador precisa de números estáveis após o envio, mas a operação continua viva (cancelamentos retroativos, correções).

**Opções.**
A) Sempre leitura viva (simples; números mudam depois do envio — inaceitável para entrega contábil).
B) Sempre snapshot (estável; obriga fechamento até para consulta e cria segunda verdade permanente).
C) **Híbrido:** leitura viva enquanto `aberta/enviada`; snapshot JSON + pacote versionado no fechamento; reabertura auditada incrementa versão; alterações operacionais pós-fechamento não editam o snapshot e geram evento `alteracao_pos_fechamento`.

**Decisão recomendada.** C.

**Consequências.** Snapshot vive em `ContadorCompetencia.snapshot` (+hash); UI distingue "vivo" de "oficial"; devolução conta na competência da devolução (não retroage); reprocessar exige reabrir.

**Riscos.** Divergência vivo×snapshot pode confundir sem UI clara; snapshot grande (mitigar: totais/contagens, não linhas).

**Não decidido.** Política de correção retroativa exigida pelo escritório contábil (reabrir sempre? nota de ajuste na competência seguinte?); prazo máximo de reabertura.

---

## ADR-CONTADOR-002 — Portal interno versus portal externo

**Contexto.** `/dashboard/contador` (interno, NextAuth) e `/contador` (legado, PIN global) coexistem; o legado monta providers do ERP e não tem identidade; a regra do GOAL preserva `/contador` e `/login-contador` até auditoria + autorização.

**Opções.**
A) Consolidar tudo no dashboard com "modo contador" (viola isolamento: contador externo dentro da sessão do ERP).
B) Evoluir o legado no lugar (herda PIN/providers/UX comprometidos).
C) **Separação total:** interno permanece em `/dashboard/contador`; portal v2 reconstruído como segmento isolado (layout/sessão/ACL próprios, zero providers do ERP); legado congelado e endurecido até substituição autorizada.

**Decisão recomendada.** C. O "modo contador" interno permanece apenas como preview de UX.

**Consequências.** Duas superfícies com um único domínio/readers por trás; `requireContadorScope()` com dois caminhos de sessão; retirada do legado só no GOAL 019 mediante G4.

**Riscos.** Duplicação de UI entre interno e portal (mitigar: componentes de leitura compartilhados sem providers).

**Não decidido.** Rota final do v2: reutilizar o caminho `/contador` após retirada do legado ou novo caminho (ex.: `/portal/contador`) — insumo do GOAL 013.

---

## ADR-CONTADOR-003 — Armazenamento e versionamento de documentos

**Contexto.** Não existe abstração documental geral: `FinancialAttachment` é anexo de transação (fileUrl/fileName, sem hash/storeId direto); fiscal guarda referências de XML/certificado. O HUB precisa de documento genérico com competência, categoria, autoria, hash e ciclo de vida.

**Opções.**
A) Estender `FinancialAttachment` (contamina domínio Financeiro; falta tudo: hash, categoria, competência, ACL, soft delete).
B) Storage novo dedicado ao contador (mais um provider para operar sem necessidade comprovada).
C) **`ContadorDocumento` próprio + provider de storage existente**, com paths namespaced `contador/{storeId}/{aaaa-mm}/{docId}`, hash sha256, MIME/tamanho validados, soft delete com motivo, substituição por `versaoDeId` (imutável: nada é sobrescrito), download só por endpoint autenticado com evento.

**Decisão recomendada.** C. O GOAL 010 audita o provider existente antes de escrever; se não houver provider utilizável, **para e pede aprovação**.

**Consequências.** `FinancialAttachment` e XML fiscal permanecem nos domínios de origem (adapters podem listá-los como fontes, sem migração); retenção/antivírus entram no GOAL 019.

**Riscos.** Provider existente pode não suportar streaming/escopo privado (descoberta do GOAL 010).

**Não decidido.** Provider definitivo; limites de tamanho por categoria; política de retenção por categoria; visibilidade default de documentos de funcionários (sensível/LGPD).

---

## ADR-CONTADOR-004 — Pacote do Contador e manifesto de arquivos

**Contexto.** O legado baixa CSV/XML montados no browser, sem manifesto, hash, versão ou trilha; o preview promete um "pacote" fictício. O pacote é o artefato de entrega ao escritório e precisa ser reproduzível e prova de conteúdo.

**Opções.**
A) Sempre sob demanda, nunca persistido (leve; sem prova do que foi entregue nem versões).
B) Sempre materializado (custo de storage; rigidez enquanto a competência está aberta).
C) **Híbrido:** sob demanda enquanto aberta (MVP, GOAL 008); materializado e versionado no fechamento (GOAL 012), com `manifest.json` (`omni.contador.pacote.manifest/v1`: fontes+filtros+contagens, arquivos com sha256/bytes, pendências, itens não disponíveis, avisos) dentro do ZIP **e** `ContadorPacote/PacoteItem` como índice consultável.

**Decisão recomendada.** C. Estrutura de pastas conforme §12 do masterplan; formatos: ZIP, CSV, MD/HTML de resumo, JSON de manifesto, XML original quando fiscal ativo.

**Consequências.** Diff entre versões via manifestos; confirmação de recebimento no portal referencia versão exata; regeneração pós-fechamento = nova versão auditada.

**Riscos.** Duplicidade manifesto×PacoteItem (aceita: um é o artefato portátil, o outro é índice de consulta/integridade); volume de storage (retenção no GOAL 019).

**Não decidido.** Inclusão de PDF de resumo (dependência de geração de PDF) vs MD/HTML no MVP; SLA de geração; dados pessoais de cliente nos CSVs (decisão LGPD de Rafael).

---

## ADR-CONTADOR-005 — Máquina de status e reabertura

**Contexto.** O GOAL original lista nove estados candidatos de competência e a máquina de item `pendente→enviado→conferido→resolvido` com "vencido" paralelo. Estados demais criam dupla verdade com o que já é derivável do checklist/timeline.

**Opções.**
A) Nove estados persistidos (expressivo; redundante e frágil — três deles são deriváveis).
B) Dois estados (aberta/fechada) (simples demais; perde o ciclo de conferência com o contador).
C) **Quatro estados persistidos de competência** — `aberta | enviada | com_pendencia | fechada` — com `reaberta` como transição (volta a `aberta`, `versao+1`, motivo obrigatório) e `em_preparacao/pronta_para_envio/em_conferencia/conferida` derivados de checklist, timeline e status de itens. Itens: `pendente→enviado→conferido→resolvido`; rejeição volta a `pendente` com comentário obrigatório; `vencido` = flag derivada.

**Decisão recomendada.** C.

**Consequências.** Transições com matriz de permissão (fechar/reabrir = elevada + confirmação + motivo + evento); UI mostra estados derivados sem persisti-los; efeitos do fechamento conforme ADR-001.

**Riscos.** Estados derivados exigem regras claras de exibição (documentar em `lib/contador/status.ts`).

**Não decidido.** Se "enviar" exige checklist mínimo completo ou apenas confirmação com pendências assumidas; quem pode marcar `conferido` internamente além do contador (proposta atual: papel financeiro).

---

## ADR-CONTADOR-006 — Dados read-only versus persistência própria

**Contexto.** O legado agrega no cliente com heurísticas; o risco clássico é o HUB virar segunda fonte de verdade de vendas/caixa/contas/estoque/fiscal.

**Opções.**
A) Copiar dados para tabelas do contador (sincronização eterna; divergência garantida).
B) Ler tudo sempre vivo, sem persistir nada (sem estabilidade pós-envio; sem domínio próprio).
C) **Fronteira estrita:** readers/adapters server-side para todo dado operacional (nunca duplicado); persistência própria **somente** para o domínio do HUB (competência, documento, pacote, comentário, status, evento, obrigação, guia); snapshots apenas no fechamento, rotulados como oficiais; VIEWS agregadas só se um reader se provar caro (medido, não presumido).

**Decisão recomendada.** C. A tabela regra-de-data-por-fonte (§7 do masterplan) é o contrato dos readers; a heurística dia/valor do legado é substituída por vínculo explícito de domínio ou por relatório separado de OS.

**Consequências.** Todo número do HUB é reconciliável com a origem; correções operacionais fluem automaticamente enquanto a competência está aberta.

**Riscos.** Performance de agregação em lojas grandes (mitigar com índices existentes; medir antes de criar VIEW/cache).

**Não decidido.** Fonte canônica de "forma de pagamento" (payload da venda × `MovimentacaoFinanceira`) e de "despesas" (categorização) — descobertas do GOAL 006 a registrar aqui.

---

## ADR-CONTADOR-007 — Integração desacoplada com Fiscal

**Contexto.** Fundação fiscal existe (`NotaFiscal`, eventos, logs) mas o runtime está parcialmente dormente/default-off. O preview promete "Notas fiscais (XML)" sem lastro.

**Opções.**
A) Acoplar o HUB ao motor fiscal (herda instabilidade e responsabilidade jurídica indevida).
B) Ignorar fiscal até homologação total (perde o artefato mais valioso quando existir).
C) **Contrato read-only `fiscalReader` atrás de `CONTADOR_FISCAL_READER` (por loja):** lista somente status juridicamente entregável (critério definido no GOAL 018 junto à trilha fiscal), sinais de rejeição/cancelamento no checklist, XML autorizado no pacote com hash; enquanto dormente, `nao_disponivel` explícito.

**Decisão recomendada.** C. O HUB jamais emite, calcula tributo ou altera dados fiscais; a `estimativaImposto()` do legado nunca alimenta obrigação/guia.

**Consequências.** Zero dependência de deploy entre trilhas; a promessa visual do preview só vira entrega com flag ligada e loja homologada.

**Riscos.** Definição de "status entregável" tem nuance jurídica — decisão conjunta com a trilha fiscal, registrada aqui.

**Não decidido.** Ambientes (homologação × produção) no mesmo pacote; inclusão de eventos de inutilização no relatório.

---

## ADR-CONTADOR-008 — Convite e autorização do contador externo

**Contexto.** Hoje: PIN único global com default `5678` e cookie literal `1`; nenhuma entidade de usuário externo, convite, vínculo com loja, expiração, revogação ou trilha. A auditoria proíbe usar isso como fundação.

**Opções.**
A) Manter PIN por loja (ainda sem identidade individual nem revogação real).
B) Reutilizar NextAuth/`User` interno com papel "contador" (mistura sessões e abre navegação do ERP ao externo).
C) **Identidade externa dedicada:** `ContadorUsuario` (email único, senhaHash com util forte já existente no repo se houver, `tokenVersion`), `ContadorConvite` (token hasheado, expiração, revogação, criadoPor), `ContadorAcesso` (vínculo usuário↔loja com papel `leitura|conferencia`, concessão/revogação auditadas); sessão em cookie próprio assinado, curto e rotativo; revogação imediata via `tokenVersion`; rate limit e eventos de login/acesso; MVP de convite por **link copiável** gerado pelo admin (sem dependência de provider de e-mail).

**Decisão recomendada.** C.

**Consequências.** Um contador atende N lojas com um único login e escopo verificado no servidor; revogar é instantâneo; toda sessão externa é atribuível.

**Riscos.** Link copiável depende do canal que o lojista usar para enviá-lo (mitigar: expiração curta + uso único + aceite exige e-mail correspondente).

**Não decidido.** E-mail automático (provider a escolher) vs link copiável permanente; MFA (recomendado como evolução no GOAL 019); SSO; recuperação de senha (fluxo mínimo no 014 ou adiado); agrupamento por Empresa/CNPJ acima de `storeId` (registrar aqui quando decidido).

---

## Encerramento

Nenhuma destas decisões está aprovada. Gates: **G2** (ADRs 001, 003, 004, 005, 006) antes do GOAL 009; **G3** (ADRs 002, 008 + rota do portal) após o GOAL 013; ADR-007 antes do GOAL 018. Ao aprovar, registrar Accepted + data + eventuais emendas neste arquivo, no branch do GOAL correspondente.
