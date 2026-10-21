# Revisão e correções da PR #294 — 21/10/2026

Núcleo isolado, sem import produtivo, banco, equipamento ou venda fracionada.
Mesma PR e branch `codex/pesagem-core-isolado`; nenhum GOAL novo.

## Proveniência e preflight

- Base remota conferida por fetch: `8aed9e1d7c7891fd1e6f53b60da53679be0f1117`.
- Head inicial revisado: `9330c8955e0edc141bb935fab9cb58655e8d3212`.
- Executor original: chat **Implementar núcleo de pesagem**, inativo no preflight.
- Revisão inicial independente: outro chat Codex (**Revisar e corrigir PR #294**),
  com segunda leitura independente pelo subagente `/root/pesagem_independent_review`.
  O subagente leu os 19 arquivos iniciais e reproduziu defeitos usando fontes do
  SHA inicial carregadas por `git show`, sem editar a worktree.
- A correção pertence ao executor deste chat. Sua verificação própria não é
  apresentada como revisão independente; a segunda leitura das correções é feita
  pelo subagente somente de leitura e vinculada ao head final na PR.
- AEP opt-in ausente na raiz e na worktree; ENTRYPOINT e AGENTS lidos. Não foram
  criados/alterados controles, GOALs, estados, ledger ou registry.
- Worktree da pesagem limpa no início; raiz com WIPs preservada. Nenhuma troca de
  branch, reset, stash ou limpeza de outras worktrees.
- PR #295 relida no head `1909c49f35ac3a07744eac23f8838c2493204877`, diferente do
  head antigo fornecido. Somente referência; nenhum commit dela foi incorporado.
- Antes da correção, check `validate` e os status de preview estavam aprovados no
  head inicial; não são usados como aprovação do novo head.

## Achados comprovados e correções

| ID / severidade | Cenário e arquivo | Observado no código inicial | Esperado e correção |
| --- | --- | --- | --- |
| R1 / P1 | `services/pesagem/connection.ts`: read, cancel ou close nunca concluem; cancel também pode lançar sincronicamente | `run`/`stop`/`retryClose` ficam pendentes; não há prazo nem falha explícita do cleanup em andamento | Aborto interrompe a espera do read. Cada espera de cancel/close tem prazo (padrão 1000 ms). Falha/prazo conserva reserva e sinaliza `cleanup_error`; retry não duplica operação pendente. ReleaseLock falho também mantém posse. |
| R2 / P1 | `connection.ts`: duas connections com a mesma sessão; segunda tem run rejeitado e chama stop; aliases do mesmo stream após close falho | Stop da segunda encerra a sessão da primeira. A reserva só pelo objeto porta deixa o stream exposto a outro adaptador depois de release | Posse explícita da sessão; controlador rejeitado não altera o dono. Porta e stream reservados em conjunto. Nenhuma sessão concorrente fecha recurso alheio. Promise de run instalada antes de acquire reentrante. |
| R3 / P2 | `lib/pesagem/session.ts` e `framing.ts`: primeiros bytes de ST aos 1000, LF aos 2000, validade 1000 | Fragmento antigo reaparece ready com receivedAt=2000 | Idade do fragmento controlada desde seus primeiros bytes conhecidos. Expira em `>= validForMs` e descarta até LF sem interpretar sufixo. |
| R4 / P2 | `session.ts`: relógio lança após leitura pronta | Snapshot lança e deixa a sessão ativa com leitura anterior | Encerra em clock_error, remove leitura e janela. Valores inválidos e regressão também testados. |
| R5 / P2 | `session.ts`: protocolo custom mantém Mass mutável ou devolve campos incoerentes | Alteração externa muda snapshot e candidato sem novo recebimento/sequência; massa inconsistente pode ser ready | Validação exata de value/unit/decimalPlaces/kilograms; cópia canônica congelada, sem congelar o objeto do chamador. Campos divergentes são invalid. |
| R6 / P2 | `framing.ts` e `protocol.ts`: `350` + CR + `kg` + LF, ou CR/controles em chamada direta ao parser | CR interior chega ao parser como whitespace e pode produzir medição | CR aceito somente em CRLF; linha inteira descartada até LF. Parser explícito exige linha ASCII sem controles além de tab horizontal. |
| R7 / P2 | `connection.ts`: retryClose imediatamente antes de run | Continuação de await null pode cancelar/fechar o canal que run acaba de adquirir | Captura a execução existente e retorna antes de qualquer await quando não há run; não interfere em execução posterior. |

Total: **P1: 2, P2: 5; todos corrigidos**. Sem P0 ou pendência de bug comprovado
nesses cenários. Reproduções e asserts permanecem nos três arquivos
`test/pesagem/*.test.ts`.

Antes das respectivas correções, os testes novos demonstraram stop alheio,
cancel/close pendentes, fragmento vencido, clock que lança, massa mutável/incoerente
e CR interior como falhas. Não foram retirados asserts nem relaxada estabilidade.
O teste legado de fragmento vencido foi fortalecido: exige stale/null na
completação tardia e confirma separadamente que uma mensagem completa nova inicia
uma janela com uma amostra. Não considera o fragmento antigo como dado novo.

Hipótese descartada: LF final em `parseMass("350\n", "g")` já era rejeitado no
SHA inicial, conforme reprodução independente em Node 24. O parser de massa não
foi alterado por essa hipótese. Leituras sintéticas não comprovam equipamento.

## Validação

Baseline local antes de qualquer correção: **66/66 PASS**. Resultado posterior:

| Local, dependências existentes `../../node_modules` | Resultado |
| --- | --- |
| Vitest com `test/pesagem/vitest.config.mts` | **95/95 PASS**, 3 arquivos, sem skips |
| TypeScript focado, `-p test/pesagem/tsconfig.json --noEmit` | PASS |
| ESLint de lib/pesagem, services/pesagem, test/pesagem, sem cache | PASS, zero diagnósticos |
| Harness `test/pesagem/harness.ts all` | PASS, oito cenários e reconexão, todos SIMULADOS |
| Whitespace/diff e staging explícito | Conferidos antes do commit |

As regressões adicionais cobrem read eterno com cancel resolvido/rejeitado ou
lançando, ausência de timers/listeners órfãos, rejeição tardia de read, falha de
releaseLock, retry concorrente, close pendente sem duplicação, aliases de recurso,
run reentrante, precisão de 24 dígitos/9 casas, limiar inclusivo de tolerância,
janela inclusiva e sequência inválida/repetida/fora de ordem sem renovação de idade.
Uma segunda passagem independente encontrou também a corrida retry-before-run;
a regressão falhou antes da correção e passou depois.

TypeScript **completo** é prova remota do workflow `Núcleo de pesagem isolado`,
executada com o schema desta branch em runner descartável. O cliente Prisma local
compartilhado é de outra revisão e não foi modificado nem utilizado como prova
do typecheck completo. O workflow usa URLs sintéticas e migrations desativadas;
não conecta a banco real. CI e head final são registrados no corpo da PR após
conclusão; os checks do head anterior não bastam.

Havia cerca de 900 MB livres. Dependências foram reutilizadas sem instalação;
nenhum build pesado ou geração de Prisma local. TEMP/TMP ficam em
`test/pesagem/.artifacts/tmp`, ignorado pelo Git.

## Fronteira comercial e preservação

PR #295: `ProductCommercialV1` continua canônico e não foi copiado/importado.
Medição `g` corresponde a `G`; `kg` corresponde a `KG`; `UN` não é massa.
`modoVenda`, base do preço, precisão comercial, capacidades e permissões
permanecem externos ao núcleo. A projeção comercial admite KG com 3 casas e
G/UN com 0; medição admite 9 na origem e até 12 em kg se recebida em g. Testes
preservam `350.000000001 g = 0.350000000001 kg` e valores além do inteiro seguro
de number sem arredondamento, truncamento ou conversão de saldo/preço.

O diff continua restrito a `lib/pesagem/**`, `services/pesagem/**`,
`test/pesagem/**`, `docs/padaria/pesagem/**` e ao workflow exclusivo original.
Zero imports produtivos, dependências de banco ou alterações em hardware-bridge,
seus consumidores, Classic, demais PDVs, Cadastros, Configurações, contrato de
quantidade, StockLedger, vendas, migrations ou secrets. N5-C e voz preservados.

Pendência física: marca/modelo/protocolo/tara/resolução/estabilidade e testes de
desconexão/retomada com equipamento. Bytes antigos retidos fora do núcleo no
driver não podem ser datados sem timestamps/contador do equipamento. Uma Promise
do driver nunca concluída também não pode ser forçada pelo JavaScript a liberar
hardware: o estado deixa isso explícito e mantém a reserva até retry confirmado.

Merge e publicação produtiva não foram autorizados nem executados. A PR entrega
aptidão para decisão humana sobre o núcleo isolado, sem alegar homologação física
ou venda fracionada operacional.
