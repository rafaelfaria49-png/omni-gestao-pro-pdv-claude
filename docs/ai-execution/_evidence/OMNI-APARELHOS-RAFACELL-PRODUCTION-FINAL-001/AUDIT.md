# OMNI-APARELHOS-RAFACELL-PRODUCTION-FINAL-001

Base: `366d630875a5619ab9543c4ae5bc4fcfafe93f06` (main e Production em 17/11/2026).
Branch isolada: `codex/aparelhos-rafacell-production-final-001`. AEP opt-in inativo.

## Inspeção inicial somente leitura

- Production: `https://omni-gestao-pro.vercel.app`, deployment `dpl_32txqL7ZRb5DzNmLELiT9fSuHCfa`, READY.
- Neon: projeto `dry-mouse-36002471`, branch `br-muddy-meadow-ac7ah2wl`, banco `omnigestao_prod`.
- Consultas executadas em transação com `transaction_read_only=on`; PostgreSQL 17.12.
- 29 migrations aplicadas; aparelhos aplicada em 14/11/2026 às 11:20:53 UTC. Nenhuma reaplicação.
- Zero unidades, vendas e aquisições no módulo de aparelhos.
- `loja-1` = RAFACELL ASSISTEC; `moduleAccess` SQL NULL legado; capability sem override explícito.
- Demais lojas sem ativação explícita. Loja-2 e Padaria TESTE fora da autorização de ativação.
- Electron instalado: ProductVersion/FileVersion **1.0.3**, verificados no executável da janela em uso.
- Build de Production registrado com `MIGRATION_SKIPPED`. Esta correção não acrescenta migrations.
- PRs #315/#331/#335/#336/#337 seguem separadas; nenhum rollout KG integrado.

## Auditoria funcional inicial

Classificação referente às provas técnicas em QA, sem representar homologação comercial em Production.

| Função | Classificação | Evidência/limite |
|---|---|---|
| Cadastro novo/usado | IMPLEMENTADA_E_TESTADA | Serviço real em PG; validações de IMEI/série e duplicidade |
| Entrada de fornecedor | IMPLEMENTADA_E_TESTADA | Unidade própria, conferência/liberação e ledger; obrigação comercial do fornecedor depende do processo Financeiro |
| Compra de cliente | IMPLEMENTADA_E_TESTADA | Protocolo, aprovação segregada, título único e baixa canônica testados em PG |
| Identidade IMEI/serial | IMPLEMENTADA_E_TESTADA | Espaço único por loja e preservação do marcador no cadastro genérico |
| Estoque por unidade | IMPLEMENTADA_E_TESTADA | Ledger e guard de escritores genéricos; revisão não integra saldo vendável |
| Liberação para venda | IMPLEMENTADA_E_TESTADA | Permissões e conferência; cadastro não autolibera vendedor/técnico |
| PDV Clássico | IMPLEMENTADA_MAS_NAO_HOMOLOGADA | Integração existente; E2E autenticado atualizado aguardando execução final |
| Venda Completa | IMPLEMENTADA_MAS_NAO_HOMOLOGADA | Integração existente; E2E autenticado atualizado aguardando execução final |
| Pagamento/confirmação | IMPLEMENTADA_E_TESTADA | Motor canônico PG: concorrência, retry e rollback; sem venda fictícia em Production |
| Garantia | IMPLEMENTADA_E_TESTADA | Snapshot/política imutável, 90 dias legais mais contratual; revisão jurídica não substituída |
| Documentos | IMPLEMENTADA_MAS_NAO_HOMOLOGADA | Snapshot, A4/80 mm, ponte Windows e teste sintético; papel ainda depende do operador |
| Cancelamento | IMPLEMENTADA_E_TESTADA | Unidade em revisão; venda mista/retry; títulos sem recebimento em um commit; recebido/compartilhado bloqueado |
| Troca/devolução F8 | BLOQUEADA | Integração da unidade exata e contrato financeiro continuam pendentes; bloqueio preservado |
| Reimpressão | IMPLEMENTADA_E_TESTADA | Emissão do snapshot; falha de impressão não reenvia venda |
| Histórico | IMPLEMENTADA_E_TESTADA | Eventos e garantias vinculados à identidade estável |
| Permissões | IMPLEMENTADA_E_TESTADA | ADMIN/GERENTE/CAIXA e segregação em QA; smoke de papéis Production pendente |
| Isolamento multiloja | IMPLEMENTADA_E_TESTADA | PG e gates de servidor; ativação controlada ainda pendente |

## Correções e limites deliberados

1. Cancelamento envia unidade para revisão; apenas liberação explícita devolve saldo comercial.
2. Estoque genérico não movimenta modelo serializado. Cadastro genérico não cria/remove/reinterpreta seu marcador.
3. Nova venda relê capability e módulo contratado na transação; replay idempotente permanece canônico.
4. Títulos exclusivos sem recebimento cancelam dentro da mesma transação. Recebidos e compartilhados exigem regularização no Financeiro.
5. Correções genéricas de venda, título, parcelas e metadados de item ficam bloqueadas para aparelhos até contrato integrado seguro.
6. Impressão 80 mm usa a ponte existente do Electron. A4 e prévia preservam a janela de documentos. Um teste sintético não grava cadastro/venda/cobrança.
7. Não há consulta oficial de restrição de IMEI; conferência continua manual, com fonte e operador.
8. Classificação contábil de aquisição em estoque versus despesa/CMV e termos jurídicos continuam sujeitos a validação profissional.

## Validação em andamento

- PostgreSQL descartável **17.10**, cluster exclusivo em `127.0.0.1:55479`; bancos `aparelhos_pg` e `aparelhos_e2e`.
- Baseline anterior à migration de aparelhos + migrations da main + drift zero comprovados.
- Rodada PG: 52 testes passaram. Alterações posteriores são revalidadas antes de publicação.
- Rodada unitária e regressões: 312 testes passaram em 18 arquivos; cancelamento/step-up incluiu 79 testes em rodada específica.
- Typecheck local interrompido após pressão severa de recursos do Windows; validação completa exigida na CI.
- Lint, build, E2E, CI final, revisão final e ativação/homologação Production permanecem pendentes neste registro inicial.

**Estado deste registro: EM_EXECUCAO. Não certifica APARELHOS_RAFACELL_PRONTO_PARA_USO_REAL.**
