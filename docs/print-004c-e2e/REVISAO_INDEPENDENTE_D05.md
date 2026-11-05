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
nenhuma delas foi mergeada pelo executor. Revisão de proveniência do SHA e evidências finais será consolidada na entrega.
