# Cadastros V2 — Cadastro Inteligente por Código de Barras — Roadmap & Registro de Decisões

> **Local no repositório:** `docs/roadmap/CADASTROS_V2_CADASTRO_INTELIGENTE_BARCODE_ROADMAP.md`
> **Versão:** 1.0 — 2026-07-09 · **Arquiteto:** Rafael · **Redação:** Claude Chat (Fable)
> **Papel:** Registro canônico. Nenhuma decisão abaixo depende de memória de chat. Alterações exigem decisão do arquiteto.
> **Comandos operacionais:** os comandos completos dos GOALs vivem no documento do arquiteto (`PLANO_OPERACIONAL_CADASTRO_INTELIGENTE_BARCODE.md`, Obsidian). Este arquivo é o registro; aquele é a operação.

---

## 1. Problema e objetivo

A loja **Rafa Brinquedos e Variedades** tem grande acervo físico sem cadastro. O objetivo é transformar a opção **"Código de barras"** do bloco *Cadastro Inteligente IA* (aba Produtos do Cadastros HUB, `/dashboard/cadastros-v2`, modal `ProductAIModal` em `components/cadastros/lovable/components/cadastros/produto-ia.tsx`) — hoje um input decorativo sem estado — em fluxo real:

**bipar → validar GTIN → busca local → cadeia de lookup externo → preenchimento SUGERIDO → revisão humana obrigatória → save manual.**

Invariantes de produto: custo, preço de venda e estoque **sempre manuais**; fiscal **sempre sugestão revisável**; nenhum produto salvo automaticamente.

## 2. Estratégia (resumo executivo)

1. **Hardening primeiro.** O caminho real de escrita do modal (`upsertProduto`) precisa de paridade defensiva antes de qualquer bipagem: normalização de identificadores, pre-check de duplicidade, P2002 amigável, merge de metadata em dois níveis, fim dos campos-fantasma. A bipagem multiplica saves com barcode preenchido — colisão vira rotina, não exceção.
2. **Cadeia honesta de provedores gratuitos.** Local → Cosmos grátis (25/dia) → UPCitemdb grátis (100/dia) → Open Food Facts (futuro/opcional). Fallback automático em limite/erro/timeout/não-encontrado. ~125 lookups externos/dia a custo zero, mais infinitos para produtos já cadastrados. **Sem plano pago agora.** Limites e termos de provedores são respeitados — nunca burlados.
3. **Ordem por qualidade, não por cota.** Semântica primeiro-sucesso-vence: a ordem da cadeia define o teto de qualidade dos dados. Cosmos primeiro (pt-BR, NCM/CEST quando existir, imagem).
4. **Telemetria como estratégia.** `metadata.barcodeLookup` (trace de tentativas + campo `aplicado`) transforma o piloto no estudo de viabilidade de um futuro plano pago: taxa de acerto real por provedor nos produtos da loja.
5. **"Não encontrado" é fluxo de primeira classe.** Brinquedos têm cobertura GTIN fraca; manual assistido com código preenchido é caminho principal, não borda.
6. **IA mínima no MVP.** Lookup + preenchimento determinístico. LLM de polimento é futuro. IA/lookup jamais inventa NCM/CEST, jamais faz aritmética fiscal.

## 3. Decisões registradas

| ID | Decisão | Racional |
|---|---|---|
| D01 | Manter `upsertProduto` como caminho de escrita do modal; evoluir à paridade, **não** trocar para REST | Preserva a proteção documentada de estoque na edição (bug histórico de zerar estoque) |
| D02 | Normalização de identificadores: trim; vazio/whitespace → `null` | `""` colide na unique `storeId+barcode`; `null` não colide |
| D03 | Pre-check estruturado de duplicidade (barcode e SKU, por loja, excluindo o próprio id) + backstop P2002 traduzido | Erro cru de Prisma nunca chega à UI; janela TOCTOU coberta pela constraint |
| D04 | Merge de metadata em **dois níveis**: namespaces não enviados preservados; chaves não enviadas dentro de namespace enviado preservadas; escalares/arrays substituem | Save do modal não pode destruir `fiscal`/`catalogoAparelhos` da REST. Teste canônico: salvar `fiscal.tributacao` preserva `fiscal.ncm/cest` |
| D05 | Descrição, Tags, Modelo compatível → `metadata.atributos` (sem migration) | Princípio: "nenhum campo visual evapora ao salvar" |
| D06 | Tributação → `metadata.fiscal.tributacao` com `tributacaoOrigem:"operador"` | Mesmo princípio; lar fiscal canônico único; GOAL 005 estende o mesmo namespace. **Validado por Rafael em 2026-07-09** |
| D07 | Feedback: adotar padrão de toast existente se saudável; senão banner interno; sem dependência nova | Fim do `window.alert` no fluxo de save |
| D08 | Validação GTIN: dígito verificador; EAN-8/EAN-13/UPC-A (UPC-A = EAN-13 com zero à esquerda); prefixo 20–29 = código interno/peso variável → **nunca** vai a lookup externo | Códigos internos não existem em bases públicas |
| D09 | Enter/CR do leitor-teclado dispara busca local, **jamais** submete o formulário | Leitores USB/Bluetooth se comportam como teclado |
| D10 | Ordem da cadeia: Cosmos → UPCitemdb → OFF | Primeiro-sucesso-vence: ordem define teto de qualidade (Cosmos = pt-BR + NCM) |
| D11 | OFF entra como terceiro **incondicional** (sem detector "é alimento"), execução adiada (004C opcional) | Prefixo GS1 indica país de registro, não categoria; nicho estreito para brinquedos |
| D12 | Sem contador persistido de cota: reagir a 429/limite com memo em memória até 00:00 (America/Sao_Paulo) + memo por GTIN do dia | Contador persistido = schema/overengineering. Débito consciente: sonda pós-cold-start |
| D13 | Troca de provedor **automática**; transparência via banner único de sessão + badge de provedor por resultado (ressalva honesta no fallback: idioma/sem NCM) | Sem decisão real por produto; botão repetitivo vira ritual |
| D14 | Sem score de confiança inventado; confiança real = `provedor + statusLookup + aplicado` | Provedores não fornecem score; inventar número viola o guardrail de honestidade |
| D15 | `metadata.barcodeLookup` gravado **sempre**, inclusive `nao_encontrado`/`erro` | "Fila" futura de não-encontrados = filtro sobre dado existente, não infraestrutura nova |
| D16 | Fiscal sugerido: aplicar exige **botão explícito**; status máximo `revisado_operador`; `confirmado` reservado a fluxo fiscal futuro (pré-NFC-e); validação sintática NCM(8)/CEST(7) antes de exibir | Aceitar deve ser ato, não omissão; sugestão ≠ verdade fiscal |
| D17 | Imagem: exibir foto do provedor como confirmação visual; persistir no máximo `imagemUrl` em metadata; download/hospedagem fora de escopo (storage, direitos de uso) | Não existe coluna de imagem no schema |
| D18 | Tabela `GtinCache` adiada | Busca local já elimina re-lookup por loja; dedup entre 2 lojas é irrelevante. Débito registrado |
| D19 | **Gate de termos de uso:** verificar se os tiers grátis (Cosmos, UPCitemdb) permitem uso comercial/produção **antes** de implementar; vetado → PARAR | Cadeia honesta inclui honestidade contratual |
| D20 | GOAL 002 fatiado: FASE 0 (auditoria read-only) com gate de aprovação escrita antes do 002B (implementação) | Auditoria antes de escrita; premissas confirmadas antes de código |
| D21 | Sugestões preenchidas no MVP (GOAL 005): nome, marca, categoria (sem auto-criar no dicionário), descrição. Tags e Modelo **não** são sugeridos no MVP | Categoria auto-criada poluiria o dicionário; tags/modelo sem fonte confiável nos provedores |
| D22 | Infra de testes inexistente = PARAR na FASE 0; instalar runner é escopo próprio (candidato a GOAL 002-A) | Não improvisar infraestrutura dentro de um GOAL de hardening |
| D23 | Re-checagem de duplicidade também no **save**, não só na bipagem | Formulário pode ficar aberto; outro operador pode cadastrar no intervalo (TOCTOU) |

## 4. Contratos de metadata (canônicos)

```
metadata.atributos = {
  descricao?: string,
  tags?: string[],            // array substitui; trim, sem vazios, sem duplicatas
  modeloCompativel?: string
}

metadata.fiscal = {
  ncm?, cest?,                          // já gravados hoje pela REST /api/produtos
  tributacao?: string,                  // GOAL 002B
  tributacaoOrigem?: "operador",
  tributacaoAtualizadoEm?: ISO,
  // GOAL 005 — somente ao clicar "Aplicar sugestão fiscal":
  origem?: "barcode-lookup:<provedor>",
  status?: "sugerido" | "revisado_operador",   // NUNCA "confirmado" neste fluxo
  revisadoEm?: ISO
}

metadata.barcodeLookup = {
  gtin: string, formato: "EAN-13" | "EAN-8" | "UPC-A" | "interno-2xx",
  consultadoEm: ISO,
  provedor?: "cosmos" | "upcitemdb" | "openfoodfacts",   // quem respondeu, se alguém
  statusLookup: "encontrado" | "parcial" | "nao_encontrado" | "erro",
  sugestoes: { name?, brand?, category?, descricao?, ncm?, cest?, imagemUrl? },
  aplicado: { [campo]: "aceito" | "editado" | "descartado" },   // computado no save
  tentativas: [{ provedor, status, em }]
}
```

Regra de merge (D04): dois níveis, aditivo. Nenhum writer substitui namespace alheio; nenhum writer apaga chave que não enviou.

## 5. Guardrails globais (valem em todos os GOALs)

1. Cadastro manual tradicional nunca é removido nem degradado.
2. Nenhum produto salvo automaticamente — revisão humana obrigatória em todos os caminhos.
3. Fiscal (NCM/CEST/tributação) é sempre sugestão revisável; status máximo `revisado_operador`; nunca verdade fiscal automática.
4. Custo, preço de venda e estoque: sempre manuais.
5. Zonas intocáveis: PDV, Caixa, Financeiro, Operações/OS, WhatsApp, Fiscal de emissão real.
6. Nenhuma migration/alteração de schema sem autorização escrita separada do arquiteto.
7. Nenhum mock fingindo integração real; nunca fingir sucesso quando nenhum provedor encontrar dados.
8. Respeitar limites e termos dos provedores; nunca burlar cota; 429 é sinal, não obstáculo.
9. Chaves de API exclusivamente server-side; jamais em client, bundle ou logs.
10. `gestao-produtos.tsx`: somente leitura. REST `/api/produtos`: somente leitura de referência.
11. Sem estado otimista de UI.
12. Commits atômicos, um por fase/entrega; **sem push sem sign-off explícito do arquiteto**.
13. PARAR e reportar diante de divergência de nível de negócio — nunca improvisar.

## 6. Sequência oficial de GOALs e status

| # | GOAL (ID) | Entrega | Gate de entrada | Status |
|---|---|---|---|---|
| 1 | CADASTROS-V2-PRODUTO-DUPLICIDADE-E-FISCAL-PARITY-002 (FASE 0) | Auditoria read-only do caminho de escrita | — | ☐ pendente |
| 2 | CADASTROS-V2-PRODUTO-DUPLICIDADE-E-FISCAL-PARITY-002B | Paridade defensiva + fim dos campos-fantasma | Relatório FASE 0 aprovado por escrito | ☑ concluído (2026-07-09) |
| 3 | CADASTROS-V2-PRODUTO-BARCODE-LOCAL-SCAN-003 | Bipagem real + validação GTIN + busca local | 002B aprovado | ☑ concluído (2026-07-09) |
| 4 | CADASTROS-V2-BARCODE-LOOKUP-COSMOS-004A | Contrato + orquestrador + adapter Cosmos | 003 aprovado · conta Cosmos + termos verificados (D19) | ☑ concluído (2026-07-09) |
| 5 | CADASTROS-V2-BARCODE-LOOKUP-UPCITEMDB-004B | Adapter UPCitemdb + prova da cadeia | 004A aprovado · termos UPCitemdb verificados (D19) | ☑ concluído (2026-07-09) |
| 6 | CADASTROS-V2-BARCODE-LOOKUP-OFF-004C | Adapter Open Food Facts | **OPCIONAL/FUTURO** — gatilho: dados do piloto mostrarem misses de mercearia | ☐ futuro |
| 7 | CADASTROS-V2-PRODUTO-BARCODE-SUGESTOES-UI-005 | Sugestões revisáveis na UI + metadata auditável | 002B + 003 + 004A + 004B aprovados (004C não bloqueia) | ☑ concluído (2026-07-09) |
| 8 | CADASTROS-V2-PRODUTO-BARCODE-E2E-DOCS-006 | E2E com hardware + documentação + roadmap atualizado | 005 aprovado | ☐ pendente |

Atualização de status: Claude Code pode atualizar **apenas esta tabela** ao concluir um GOAL (escrita permitida em todos os GOALs de implementação), mediante registro no relatório final.

## 7. Condições de PARAR globais

- Necessidade (mesmo aparente) de migration/mudança de schema.
- Termos de provedor vetando uso comercial/produção no tier grátis.
- Descoberta de consumidor ou caminho de escrita não mapeado para `Produto`/`upsertProduto`.
- Infraestrutura de testes inexistente para o escopo (FASE 0) — instalar runner é escopo próprio.
- Divergência entre premissa documentada e código real.
- Autenticação de provedor exigindo mais que chave simples em header/query.
- Necessidade de tocar arquivo/área proibida.
- Bug crítico em validação (perda de dado, duplicidade não bloqueada, save automático indevido, vazamento entre lojas).

Regra geral: em dúvida, PARAR custa minutos; improvisar custa dias.

## 8. Débitos e futuros registrados

- Tabela de quota persistida (só se o piloto mostrar cold starts desperdiçando sondas em excesso) — D12.
- `GtinCache` entre lojas — D18.
- OFF / GOAL 004C — executar quando dados do piloto mostrarem misses de mercearia; avaliar obrigações da licença ODbL (atribuição; share-alike em redistribuição de base) no momento da implementação.
- LLM de polimento (limpar títulos poluídos; mapear categoria do provedor → dicionário da loja).
- Download/hospedagem de imagem de produto (storage + direitos de uso) — hoje só `imagemUrl` em metadata.
- Cálculo de Margem no modal (hoje somente-leitura vazia) — GOAL cosmético próprio.
- Fila/painel de não-encontrados = filtro sobre `barcodeLookup.statusLookup` — D15.
- Reuso do serviço de resolução em PDV/Inventário (o serviço já nasce compartilhável em `lib/barcode-lookup/`).
- Câmera como scanner: auditar existência no GOAL 006; implementar só se já existir capacidade no projeto.
- Edição livre de NCM/CEST no modal (fluxo fiscal próprio, trilha pré-NFC-e).
- Registros legados com `barcode: ""` no banco (se a FASE 0 encontrar indícios): limpeza de dados é decisão/escopo separado.

## 9. Contexto de produto relacionado (não tocar nesta trilha)

Bloqueadores pré-comerciais conhecidos do OmniGestão Pro — **trilhas separadas, fora deste roadmap**: NFC-e (emissão), devolução/troca no PDV Supermercado, conciliação de pagamento integrado. O ciclo de status fiscal desenhado aqui (`sugerido → revisado_operador → confirmado`) foi pensado para se encaixar na futura trilha NFC-e (emissão exigirá `confirmado`), mas nada de emissão é implementado nesta trilha.
