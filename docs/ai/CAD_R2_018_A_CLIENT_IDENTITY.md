# CAD-R2-018-A — Identidade e dedupe canônicos de Cliente

Fundação pura e testável para o Cadastros R2. **ClientWriteService**
foi entregue em CAD-R2-008. Este GOAL **não** faz merge (CAD-R2-018-B),
**não** cria unique/migration (CAD-R2-019) e **não** abre a frente LGPD
(CAD-R2-020).

Código: `lib/cadastros/client-identity/`.

## Contrato

`principal + unidade + operação + recurso` — o `storeId` efetivo é o do
**scope autorizado** (gate REST/Action). `storeId`/`actor`/`userId` no
payload do caller são ignorados e nunca ampliam o alcance.

Campos reais do model `Cliente` usados como sinais:

| Campo | Papel |
|---|---|
| `storeId` | Fronteira obrigatória da dedupe (scope, não payload) |
| `document` | Identidade **forte** só com CPF/CNPJ de DV válido |
| `phone` | Contato — candidato à revisão, nunca auto-merge |
| `email` | Contato — candidato à revisão, nunca auto-merge |
| `name` | Sinal **fraco** — insuficiente sozinho |
| `kind` | PF/PJ — não é identidade |
| `city` / `tags` (endereço) | **Fora** da identidade neste GOAL |

## Normalização (reuso)

- Documento: `digitsOnly` (`lib/import-normalize.ts`) + `isValidCnpj`
  (`lib/fiscal/fiscal-validators.ts`) + validador de CPF (não existia
  helper de DV reutilizável; `lib/cpf.ts` só corta dígitos).
- Telefone: `phoneDigitsAll` (`lib/phone-br.ts`). Prefixo `55` só é
  removido quando o restante tem 10 ou 11 dígitos (convenção já usada em
  `normalizeTelefone`). Não inventa DDD/país.
- Email: trim + lowercase. Sem dots do Gmail, sem `+tag`.
- Nome: `normalizeNameForMatch` (`lib/import-normalize.ts`).

## Política (`AUTO_MERGE=NO`)

| Outcome | Quando |
|---|---|
| `EXACT_DOCUMENT_MATCH` | Mesmo CPF/CNPJ **válido**, mesma store, um candidato |
| `POSSIBLE_CONTACT_MATCH` | Mesmo telefone ou email, sem documento forte suficiente |
| `IDENTITY_CONFLICT` | Documentos fortes diferentes (contato/nome não desfazem) |
| `AMBIGUOUS` | Vários candidatos plausíveis / vários fortes — fail closed |
| `NO_MATCH` | Sem sinal, só nome, vazios, ou outra store |

Revisão humana obrigatória em todo outcome ≠ `NO_MATCH`. IA não decide.

## Lookup

Porta `ClientIdentityRecordSource` + adapter Prisma **read-only**
(`lookup-prisma.ts`, `server-only`). Toda query leva `where.storeId` do
scope. Linhas de outra unidade são descartadas e **não** aparecem no
veredito (sem id/nome/documento/email/telefone).

## Inventário de writers (entrada do 008)

Ver `writers-inventory.ts`. Em CAD-R2-008 os writers ativos de create/update
passaram a adapters do `ClientWriteService`. Hard delete permanece fora.

## Dívidas observadas

- `docDigitsForDedupe` trata qualquer 11/14 dígitos como chave, sem DV.
- `persistirClientesSmart` deduplica só por nome.
- Sem unique `(storeId, document)` no schema atual; `document` default `""`.
- Telefones históricos podem estar mascarados — o Prisma busca por
  `contains` e a política normaliza em memória; 019 deve considerar
  coluna normalizada.
- `normalizeNomeCliente` duplica `normalizeNameForMatch`.
- Endereço em `tags` não entra na identidade.
- Importadores e REST ainda persistem documento sem validar DV
  (compatibilidade de entrada; a fundação **não** os trata como fortes).
