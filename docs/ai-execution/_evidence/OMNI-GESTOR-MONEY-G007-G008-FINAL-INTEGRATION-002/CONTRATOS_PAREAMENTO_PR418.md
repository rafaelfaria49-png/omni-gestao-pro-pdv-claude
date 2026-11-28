# Contratos de pareamento WhatsApp — PR #417 → interface da PR #418

Server Actions em `app/actions/gestor-money-vinculo.ts` (branch `claude/gestor-money-conversational-engine-001`).
A #418 só chama estas funções; não há componente visual na #417 e nada da UI precisa ser duplicado.

**Regras comuns**
- A identidade vem SÓ da sessão web (`requireEnterpriseSession`). Nenhuma action recebe `userId`, `perfilId` ou `storeId`.
- Tudo DESLIGADO sem `GESTOR_MONEY_ENABLED=true` e `GESTOR_MONEY_WHATSAPP_GESTAO=ligado`. Nesse caso todas respondem `{ ok: false, erro: "Indisponível." }`.
- Os erros voltam como resultado (`{ ok: false, erro }`, texto pronto para exibir), nunca como exceção.
- A confirmação do vínculo NÃO é feita por action: o usuário envia o código pelo WhatsApp ao número do assistente. A tela consulta `situacaoVinculoWhatsApp` até o estado sair de `PENDENTE`.

| Action | Entrada | Saída `ok: true` | Uso na tela |
|---|---|---|---|
| `gerarCodigoVinculoWhatsApp` | `{ telefoneE164: string; aceitouConsentimento: boolean }` | `{ codigo, expiraEm (ISO), telefoneMascarado }` | Iniciar pareamento e também **novo pareamento** (cancela o pendente anterior). Mostrar o código UMA vez; ele não volta em nenhuma outra resposta. |
| `situacaoVinculoWhatsApp` | — | `{ estado, vinculado, pendente, consentimentoVersao, numeroAssistente }` | Consultar o estado (polling enquanto `PENDENTE`). |
| `cancelarPareamentoWhatsApp` | — | `{ cancelado: boolean }` | Desistir do código pendente (ex.: trocar de telefone). Idempotente. |
| `revogarVinculoWhatsApp` | — | `{ revogado: true }` | Revogar o vínculo. Sem vínculo, responde `ok: false` com "Não há WhatsApp vinculado à sua conta." |

**`estado`** (calculado pelo relógio do banco):
- `SEM_VINCULO`: nada pendente nem vinculado.
- `PENDENTE`: código válido aguardando a mensagem. `pendente = { telefoneMascarado, expiraEm, tentativasRestantes }`.
- `EXPIRADO`: o código venceu (10 min). A tela oferece "gerar novo código".
- `BLOQUEADO`: 5 códigos errados. A tela oferece "gerar novo código".
- `VINCULADO`: `vinculado = { telefoneMascarado, desde }`. Se houver um novo pareamento em curso, `pendente` vem junto.

Os estados `EXPIRADO` e `BLOQUEADO` só aparecem para desafios decididos nos últimos 30 minutos.

**Limites e mensagens de erro**
- Formato do telefone: E.164 (`+5511999990000`).
- Consentimento obrigatório (versão `gm-whatsapp-consentimento-v1`).
- No máximo 5 códigos por hora por usuário.
- Telefone já vinculado a OUTRA conta: o assistente recusa pelo próprio WhatsApp. A tela continua mostrando `PENDENTE` até expirar.

**`numeroAssistente`**: vem de `GESTOR_MONEY_WHATSAPP_NUMERO_EXIBICAO` e serve só para exibição (ex.: "envie o código para +55…"). `null` se a variável não estiver definida. O roteamento real usa `whatsapp_canais`.

**Mensagens do próprio assistente no WhatsApp**: vinculado, código incorreto (com tentativas restantes), expirado, bloqueado, sem pareamento pendente, número de outra conta, onboarding para número não vinculado e vínculo revogado. Ver `TEXTOS` em `lib/gestor-money-assistente/whatsapp/gateway.ts`.

**Provas em PostgreSQL descartável**: `test/gastos/assistente-whatsapp.postgres.test.ts`, cenário "contrato de tela (#418)". Cobre `SEM_VINCULO` → `PENDENTE` → cancelar → código cancelado não vincula → `EXPIRADO` → `VINCULADO` → novo pareamento substitui o anterior → revogação → `SEM_VINCULO`.
