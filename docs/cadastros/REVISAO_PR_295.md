# Revisão e correções da PR #295

Base consultada novamente: `8aed9e1d7c7891fd1e6f53b60da53679be0f1117`.
Head de entrada: `b08621372de80bdded80feb21ae470144ddb3487`.
Revisão dos 34 arquivos originais e dos consumidores de configuração/produto/venda.
As correções e as novas provas de integração ampliam o diff; o corpo da PR registra
o SHA final revisado e os checks correspondentes.

Proveniência: revisão do próprio executor Codex neste chat, **não independente**.
Não havia revisão externa submetida no preflight. AEP opt-in inativo na worktree;
nenhum novo GOAL, state, ledger ou registry foi criado ou alterado.

## Achados comprovados e correções

| ID / severidade | Arquivo / cenário | Observado antes | Esperado e correção | Regressão |
| --- | --- | --- | --- | --- |
| R1 / P1 | `lib/cadastros/product-commercial-contract.ts`: `comercial` com unidade KG e modo unidade, versão desconhecida, modo inválido ou null | Guard não lançava; projeção marcava venda unitária operacional | Presença inválida é explícita e bloqueia venda; erro de domínio 409 em V1/V2. UI avisa e não reenvia defaults. Writer preserva o namespace existente e recusa CLEAR/reinterpretação | `lib/store-business-capabilities.test.ts`, rotas V1/V2, testes de componente e writer |
| R2 / P1 | `lib/cadastros/product-write-service.ts`: dois patches parciais concorrentes de atributos | Descrição do primeiro patch desaparecia no segundo, que havia lido snapshot antigo | Lock da linha por id + loja antes da releitura e merge. Dados omitidos são conservados | `patches concorrentes preservam chaves omitidas de metadata`; duas conexões PostgreSQL na integração |
| R3 / P2 | `lib/store-settings-provider.tsx`: GET falha e há atalhos locais elegíveis | Provider fazia PUT de backfill após HTTP 500 | Backfill exige leitura confirmada da loja. JSON/envelope inválido ou resposta de outra loja não hidrata configuração | `lib/store-settings-business.component.test.ts` |
| R4 / P2 | Mesmo provider: primeira renderização após troca A → B | Impressora e tema de A ainda apareciam no contexto de B | Impressão e aparência usam o mesmo snapshot validado da loja que capabilities | Teste captura primeira renderização de B antes dos efeitos |
| R5 / P2 | `app/api/settings/perfil-loja/route.ts`: acesso autorizado a id inexistente | HTTP 200 com perfil de assistência inventado | HTTP 404, sem perfil e sem ler settings | `app/api/settings/perfil-loja/route.test.ts` |
| R6 / P1 | `lib/cadastros/product-write-service.ts`: PATCH de produto unitário com `vendaPorPeso: true` na raiz ou em `atributos` | Writer aceitava e passava a interpretar unidade/saldo como peso, sem enviar `comercial` | Validar modo e unidade no metadata final mesclado, incluindo flags legadas; recusar sem mudar dados | Dois casos do writer e dois casos PostgreSQL com snapshot integral |
| R7 / P2 | `components/cadastros/lovable/components/cadastros/produto-ia.tsx`: editar só uma aplicação ou ocultar grade durante a edição | Formulário reenviava false para aplicação não tocada e para grade ocultada, podendo apagar preferências de metadata | Rastrear aplicação por chave; omitir campos não tocados e namespace comercial oculto em edição | Dois testes do componente real reproduzem os valores false enviados antes e a omissão após a correção |

Reprodução antes das correções: 7 falhas em 34 testes (declarações inválidas,
backfill, primeira renderização e loja inexistente); teste adicional de concorrência
falhou mostrando a chave `descricao` perdida. Os mesmos cenários passam corrigidos.
Os testes novos de resposta HTTP 200 inválida/outra loja ampliam o tratamento de R3.
Na releitura do SHA corretivo `1909c49f35ac3a07744eac23f8838c2493204877`, dois
testes adicionais reproduziram R6 (`ok: true` em vez de VALIDATION). A validação
foi ampliada ao resultado mesclado e os mesmos casos foram adicionados ao banco real.
Dois testes adicionais de R7 também falharam antes da correção, mostrando
`cadastroRecursos.acessorios: false` e `comercial.gradePlanejada: false` indevidos.

R1 também cobre declarações legadas de peso na criação: exigem preferência da loja
provada e saldo inicial zero. Nenhuma capacidade operacional nova foi habilitada.

## Validação e limites

- Suíte focada de Ramos, Cadastros, contratos, autorização e vendas: 283 testes em
  18 arquivos, sem skips. Não representa toda a suíte do repositório.
- Regressão ampla de Cadastros/consumidores: 1.190 aprovados em 67 arquivos;
  31 pulados em três arquivos de integração por ausência de banco local.
  Os conjuntos focado e amplo têm sobreposição e não devem ser somados.
- Lint dos arquivos alterados: sem erros; três avisos preexistentes (dependências
  de efeitos em Geral/Unidades e diretiva não utilizada em teste legado).
- Smoke Chromium com componentes/CSS reais, I/O/contexto sintéticos: 1440, 390 e
  320 px; sem overflow, erros de página ou requests externos. Mantidos tokens,
  tipografia, layout e labels. Aviso de declaração inválida coberto pelo componente.
- TypeScript completo e build sem migrations são gates da CI do head final.
  Build local não executado por menos de 1 GB livre; nenhum artefato alheio apagado.
- Novo job PostgreSQL descartável executa onze integrações reais: V1/V2 com produto
  unitário seguido de peso, declaração inválida, rollback integral (inclusive
  numeração V2), unitários, replay confirmado após mudança posterior de metadata,
  preservação ao reabrir, bloqueio de reinterpretação por flags legadas, patches em
  duas conexões e configuração concorrente.
  Somente autenticação/automação/gate V2 são fixtures; handlers, writers, Prisma,
  transações e banco são reais. O guard exige CI GitHub, loopback e URL exata do
  serviço descartável já usado pela suíte existente. Materializa schema inalterado
  no banco vazio com `db push`; não executa migrations, seed, backfill nem produção.
- A suíte PostgreSQL existente de Cadastros permanece separada e intacta.
  Relatórios ficam nos artifacts de cada job; resultados finais no corpo da PR.

## Compatibilidade e preservação

Fonte canônica permanece `StoreSettings.printerConfig.capabilities`, versão 1.
Não há novo registro de flags, layout, plano, autoridade, estoque ou preço.
Overrides explícitos (inclusive false), apresentação e patches concorrentes
continuam respeitados. O descriptor comercial mantém versão e campos; recebe
somente classificação explícita de invalidade na projeção e erro seguro de venda.

N5-C: nenhum dos 16 padrões reservados alterado. Classic, demais superfícies,
generated Prisma versionado, StockLedger e contrato de quantidade preservados.
Pesagem: nenhum arquivo de `lib/pesagem`, `services/pesagem`, `test/pesagem`,
workflow e handoff da frente de pesagem modificado. Voz: nenhum arquivo reservado
de captura/ação/runner da frente alterado. Worktrees e WIPs alheios preservados.

Peso e grade continuam preparação; balança, venda fracionada, estoque por variação
e homologação de equipamentos não foram entregues por este PR.
Sem force push, bypass, merge, alteração de secrets ou deploy produtivo.

## Revisão independente e segunda correção

Em 2026-10-21, Claude Code 2.1.288, modelo `claude-opus-5-5`, sessão nova
`df7bee57-64b6-4cf7-91e0-877ab135c8f2`, revisou integralmente os 37 arquivos
no head `b2df14d18e8c7584b7377b3be1fc34b284e7e727`. Confirmou R1–R7 e
executou 283 testes focados e 78 de consumidores em conjuntos separados.
Seu parecer técnico foi CHANGES_REQUESTED, publicado como COMMENT na
[PR #295](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/295#pullrequestreview-5605188730),
sem aprovação formal ou humana.

| ID / severidade | Reprodução pelo Codex antes da correção | Correção escrita pelo Codex |
| --- | --- | --- |
| RI1 / P1 | Três casos de HTTP 500, JSON inválido e rede deixavam o PDV esperando hidratação | Separar tentativa concluída (`hydrated`, escopada por loja) de leitura confirmada (`loaded`). Recursos e backfill exigem `loaded`; PDV usa seu fallback existente. Editor exibe erro com recarga; assistência legada da mesma loja conserva apresentação |
| RI2 / P2 | Três snapshots antigos de aparência, atalhos ou impressão restauravam ramo/apresentação e override true sobre false atual | Somente patch dedicado de `printerConfig.capabilities` altera esse namespace. Blobs com seções irmãs preservam capabilities sob o lock existente. Aparência envia só sua seção; arquivos reservados do PDV preservados |
| RI3 / P2 | Nove casos de OS, delta, ajuste cadastral e correção de venda aceitavam peso/declaração inválida como unidade | Reutilizar guard comercial nas novas baixas de correção/OS, ajustes/entradas manuais, REST e importação entre lojas (origem e destino). Rejeitar antes do cadastral quando há intenção de saldo incompatível; conservar transações e compensações históricas |

Os nove testes de RI3 e os seis de RI1/RI2 falharam antes dos respectivos fixes.
Asserções existentes preservadas; o fake transacional REST recebeu a leitura de
Produto agora usada pelo adapter, conservando suas expectativas de atomicidade.
Foco ampliado local: 358 aprovados em 24 arquivos. Novas provas PostgreSQL cobrem
rollback de OS com unitário seguido de peso, rascunho/itens/payload, correção de
venda, cinco entradas de saldo, snapshot antigo, estorno e devolução históricos.
Usam exclusivamente o serviço descartável autorizado da CI. Auth/PIN são fixtures;
handlers, writers, locks, plano financeiro, StockLedger e PostgreSQL são reais.

As quatro sugestões P3 permanecem registradas no parecer inicial; não são tratadas
como bloqueios nem capacidades entregues. As correções acima são do Codex e exigem
outro contexto novo do Claude Code sobre o novo head. Contagens finais e CI do SHA
exato ficam no parecer final da PR.
