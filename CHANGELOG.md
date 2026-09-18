# Changelog

## 2026-09-17

### Cadastros — Revisão de duplicados + merge de Cliente (CAD-R2-018-B)

- Capability server-only própria (`ClientMergeService`): discovery read-only store-scoped, preview com plano/fingerprint determinístico e execução em UMA transaction (lock consultivo → revalidar → reassign das 6 referências vivas → campos via ClientWriteService → audit `cliente.merged` → delete do loser).
- Survivor sempre de escolha humana explícita; sem auto-merge, sem IA, sem merge cross-store/em massa; snapshots históricos (clienteNome, payloads, snapshots fiscais) intactos; sem schema/migration.

### Cadastros — ClientWriteService canônico (CAD-R2-008)

- Boundary única server-only para criar/editar Cliente: normalização, validação, ownership, identidade/dedupe (`client-identity`), persistência e auditoria atômicas.
- Writers ativos (Actions, REST, PDV quick, OS V3 via Action, importadores, Smart Genius, inativação em lote) passaram a adapters finos — sem motor paralelo de dedupe por nome/telefone/documento.
- Revisão humana é contrato explícito; `force=true` não atravessa. Hard delete e merge ficam fora. Sem schema/migration.

### Cadastros — Identidade e dedupe canônicos de Cliente (CAD-R2-018-A)

- Fundação pura em `lib/cadastros/client-identity`: normalização determinística de documento/telefone/email/nome e classificação store-scoped (`NO_MATCH` / `EXACT_DOCUMENT_MATCH` / `POSSIBLE_CONTACT_MATCH` / `AMBIGUOUS` / `IDENTITY_CONFLICT`).
- Sem auto-merge, sem ClientWriteService, sem schema/migration. Lookup server-side não atravessa unidades e não vaza PII cross-store.
- Inventário dos writers atuais de Cliente fica documentado para o CAD-R2-008.

### Cadastros — Voz no Cadastro Inteligente de Produto (CAD-R2-017)

- Em **Descrever produto**, o operador pode ditar a descrição (Chrome/Edge, HTTPS ou localhost) ou continuar só com texto.
- A transcrição fica editável e segue o interpretador de texto livre já existente; aplicar só preenche o formulário.
- Áudio e transcrição não são gravados no produto. Disponibilidade do microfone é detectada de forma honesta.

## 2026-08-29

### PDV — Venda em espera

- Restaurado o acesso visível `Em espera` em Assistência, Clássico e Supermercado.
- Reutilizada a persistência local existente de `lib/pdv-hold`, com atualização da UI, múltiplos holds e isolamento por loja/terminal/tipo de PDV.
- Resume preserva itens, quantidades, preços, descontos, cliente, acessórios e metadados de linha suportados por cada PDV.
- Retomar com carrinho ocupado exige confirmação e guarda o carrinho atual; descartar confirma que apenas o hold local será removido.
- Hold continua sem criar venda, baixar estoque ou movimentar Financeiro, Caixa ou Fiscal.
