# Revisão independente D05

Revisor separado `/root/d05_independent_review`, somente leitura. Escopo: delta da preparação D05 sobre
`0e9eb95d578c6c57e7e7f4b8b71355f460d970a4`, sem repetir a auditoria D01–D04 aprovada. Nenhuma instalação, impressão,
criação de ambiente ou acesso produtivo feito pelo revisor.

**Parecer do código de preparação: APPROVE — sem P0/P1/P2 pendentes.**
O parecer não autoriza hardware, transporte, banco, Preview, merge ou produção. `PHYSICAL_HOMOLOGATION=PENDING`.

| Achado | Correção verificada pelo revisor |
|---|---|
| P2 — registro podia aceitar equipamento vazio e referência não cadastrada | inventário exige modelo do computador/impressora, versões Windows/Node/PowerShell/Chrome/Edge, driver, fila, porta, bobinas e referências únicas; cada caso resolve equipamento no inventário |
| P2 — aceite final podia anteceder todos os testes | timestamp do aceite deve suceder os fins de execução e decisões N/A; a autorização prévia não substitui o aceite final |

Verificação independente: cinco testes offline PASS, incluindo novos negativos para os dois P2; plano PASS/PENDING;
ZIP/manifesto/18 arquivos D04 íntegros em leitura, SHA-256 `f48b30977a4cff2384e0ccfb8bf45bcc741d7da36c6edb3790cb55561255832a`,
contentId `1cfecac07faec9fea0d3e5e5c582ebb509564c9a502fc4be28b9884dcc7db540`, sem assinatura. Nenhuma falha de teste de
software/spooler pode promover o template físico a PASS; inventário, contagens, fotos, IDs e aceite são exigidos no registro.
A veracidade das observações/fotos continua sendo responsabilidade do operador e do proprietário, fora do alcance do validador.

Conferidos: cinco gates pendentes, produção NULL, Preview automático da branch bloqueado, nenhuma criação externa automática,
nenhuma alteração do runtime/PDV/schema/contratos D01–D04, preservação UNKNOWN/diário/fila/histórico, rollback e desmontagem
com autorização. O plano explicita a futura ativação exclusiva de Preview e a incompatibilidade atual com header de bypass
Vercel, sem contornar as proteções.

Compatibilidade do delta: caminhos da preparação D05 não colidem com alterações da PR #331 (`b0de724b4abac15258e498a7a44ab700348ebe17`)
ou de main (`37acc3b7e71d20dcbe623e6a2f87347e54f49ee6`). Isso não equivale a execução funcional combinada de #331 e #327;
nenhuma delas foi mergeada pelo executor.

## Conferência independente do CI

**APPROVE final técnico da preparação no SHA `1613ef6dfb564a81ba4713644d9bd2696d7e87f5`.** O revisor consultou as APIs
GitHub de PR/artefatos/jobs e confirmou a PR #334 draft, base #327, head e checkout técnico
`e4697c02873d48d334ecce6a76bd31376767d467`. Todos os seis jobs de D03/D04/D05 concluíram com sucesso.

Reexecutou apenas os verificadores de leitura, sem repetir as baterias: D03 run `42071630703` attempt 1, 16 etapas;
D04 run `42071630936` attempt 1, Windows 7 etapas e Linux 3. Os resultados são idênticos aos `CI_*.json`; digests obtidos
independentemente da API conferem com os ZIPs, hashes dos logs, exit 0 e proveniência run/attempt/checkout. As oito
mutações têm exit 1, asserção real e fonte restaurada. Build CI contém `MIGRATION_SKIPPED` e `PROXY_PRISMA_ARTIFACT_VERIFIED`.

D05 run `42071630596`: artefatos Linux/Windows, ZIP interno, contentId, 17 arquivos + manifesto conferidos, assinatura
ausente e 18 casos BLOCKED. Logs de instalação/DPAPI D04 conferidos: tarefa Interactive/Limited/IgnoreNew, atualização
preserva journal/instance, desinstalação mantém histórico, outro usuário recusa DPAPI. Tudo restrito ao runner descartável.

Os logs locais com timestamp têm hashes corretos e proveniência WIP explícita; falhas da sandbox/D02 local não são
atribuídas a sucesso nem ao SHA remoto. O commit documental posterior apenas incorpora essas provas e o manifesto
oficial. A igualdade de fontes com o código testado é conferida antes da entrega; aprovação física continua PENDING.

## Fase de ambiente autorizada pelo proprietário

Revisão separada do delta posterior a `4f60faa19e12a5b5515c28abe82b5c98fe87a952`, ainda sem atribuição a SHA de CI.
Parecer: **APPROVE técnico do delta corrigido, pendente de vinculação ao novo SHA/CI e comprovação TLS efetiva**.

| Achado | Correção verificada |
|---|---|
| P1 — sslmode=require sem sslaccept permitia o default accept_invalid_certs do Prisma6 | D05 exige require+strict; libpq usa verify-full com CAs públicas; resolve D02 traduz verify-ca/full para strict e preserva bundle em sslcert; sem mudança de SQL/migrations |
| P2 — diretório privado igual à raiz do repositório escapava do teste de prefixo | helper puro recusa igualdade/descendentes antes de IO, usado por leitura/escrita; PowerShell também recusa igualdade antes de criar diretório |

O revisor reexecutou somente dez testes offline, todos PASS, incluindo os negativos TLS/paths e a conversão D02.
Sem outros P0/P1/P2 encontrados. Seed usa upsert sem reset e estoque canônico/idempotente; D04 e migrations produtivas
inalterados; produção continua fechada. Não leu segredos, banco ou hardware, nem instalou/imprimiu.
Prova real redigida posterior: `authorized-environment/STRICT_TLS.json`; publicação Preview depende do CI do commit específico.
Nome do operador e janela não foram preenchidos na resposta humana; execução física permanece PENDING.

Parecer posteriormente vinculado ao SHA `76ec7c363b915b871c6e91f55a17ceda862d9fb9`; prova TLS efetiva conferida pelo revisor.
CI D02/D04/D05 PASS nesse head; D03 falhou na coordenação do harness de kill (sem alteração do agente produtivo).
O corretivo de coordenação e o novo SHA exigem revisão/CI próprios antes de configurar/ativar Preview.

Corretivo do harness: **APPROVE técnico, sem P0/P1/P2 pendentes**, após revisão do cancelamento do observador e da barreira
restrita ao host simulado. Agent, FakeSpooler e políticas inalterados. Asserções originais mantidas e reforçadas com
sendKey morto em UNKNOWN, único SUBMITTING/única chamada daquela venda e exit real antes da recuperação. Resultado local
final PASS, com12 vendas,12 chamadas simuladas,3 processos,11 SPOOLER_ACCEPTED/1 UNKNOWN e max1 por venda; ESLint PASS.
O SHA corrigido será vinculado ao parecer após congelamento. CI próprio obrigatório; FAIL anterior permanece preservado.
