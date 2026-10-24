# Cadastro manual para padaria

Missão descritiva sobre `40bf6239c352be0c5ac81a2ffa4b4464b18e03bc`, main efetiva
conferida no preflight. Branch/worktree própria `codex/cadastro-manual-padaria`.
AEP opt-in ausente; nenhum GOAL, número CAD-R2, state, ledger ou registry criado.

## Fluxo e contratos

O editor existente `ProductAIModal` usa ramo/recursos de `useStoreBusiness` e
`ProductCommercialV1`. Na padaria, nome/categoria, forma de venda e precificação
vêm antes dos códigos e saldo. Marca, fornecedor, garantia, descrição/tags e fiscal
ficam em seções recolhidas. Nos demais ramos, os campos completos permanecem
visíveis; compatibilidade/acessórios continuam dependentes dos recursos e da
aplicação ao produto. Categoria/marca reutilizam os cadastros existentes.

SKU e código de barras são opcionais. Sem código informado, o writer conserva a
semântica canônica (identificador de produto existente; SKU/barcode nulos), sem
fabricar GTIN ou uma sequência. O input permite digitação/bipagem e Enter não
dispara gravação ou consulta externa. Duplicidade continua decidida no servidor,
por loja, pelo mesmo `upsertProduto` → `ProductWriteService`.

Preço/custo informam a base UN/KG/G. KG/G conservam o valor declarado, sem conversão.
Peso continua **preparação**: venda bloqueada, saldo inicial zero, sem balança,
fracionamento ou alteração da unidade histórica. Grade também permanece no
contrato descritivo anterior. O contrato comercial e os fontes do PDV/pesagem não
foram editados.

Dinheiro reutiliza `parseValorDigitadoV3` (parser estrito já publicado): vírgula,
ponto decimal e agrupamento brasileiro, por exemplo `1.234,56`. A UI distingue
vazio/zero/inválido/positivo; não remove letras para fabricar um número. Quantidade
e garantia aceitam inteiros não negativos dentro da precisão de Int, sem truncar
frações, notação exponencial ou não finitos. Vazio omite o campo; o create mantém
os defaults existentes do writer e a edição preserva o valor salvo. Zero explícito
é enviado. Preço ausente/zero não representa aptidão comercial. Não há alteração
global das regras de preço/ativação ou do writer. O input de margem automática
foi retirado; a listagem não exibe 100% quando falta custo.

Em edição, somente diferenças viram patch. Garantia, fiscal, acessórios,
descrição/tags, códigos e propriedades não alteradas são omitidos. Fiscal usa os
helpers de leitura/merge existentes, sem sugestão de classificação ou mudança de
permissão. Saldo permanece somente leitura e segue a movimentação canônica.

`Salvar e cadastrar outro` usa o mesmo writer. A confirmação do servidor monta
uma ficha nova, sem productId, códigos, saldo anterior ou dados específicos, mantém
a loja e foca o nome. Uma referência síncrona bloqueia duplo envio. Rejeição
confirmada mantém os dados e permite correção. Resposta incerta mantém a ficha,
bloqueia outra submissão e oferece consulta pelo reader canônico da loja. Uma busca
por nome/código não comprova autoria/idempotência da tentativa: informa candidatos
ou ausência na consulta e exige conferência, sem retry automático nem afirmar que
nada foi gravado. Não existe idempotência cadastral de backend nova nesta missão.

Fechar/reabrir ou trocar produto/loja desmonta o contexto anterior. Leituras,
criação de dicionários e respostas de gravação descartadas não alteram outra ficha.
O modal de produto ganha nome acessível, labels, foco inicial/restaurado e ciclo de
Tab; as opções de acessibilidade são locais ao uso desse editor.

## Verificação

- Local: 980 testes em 52 arquivos PASS, sem skips nesse recorte (Cadastros,
  contrato comercial, writer, natural text/voz e action interativa). Os 70 testes
  iniciais estão incluídos nesse total e não são somados.
- ESLint focado: PASS. Diff check: PASS.
- TypeScript completo local atingiu o heap disponível; sem build pesado local.
  Gates completos executados na infraestrutura existente de CI, com a aplicação
  compilada em produção e PostgreSQL descartável. Resultados e head exatos devem
  ser consultados na PR desta missão; não se declara CI/revisão/deploy por antecipação.
- E2E reutiliza NextAuth Credentials, actions, writer e persistência reais. Novos
  cenários em `08-cadastro-manual.spec.ts`: sem SKU/EAN + categoria pela UI + edição
  e nova sessão; embalado + dupla submissão retendo resposta após commit + dois
  produtos distintos + códigos iguais entre lojas; base G; números inválidos,
  vazio e zero; resposta perdida depois de commit real com consulta sem reenvio.
  Cenários herdados cobrem KG, assistência/variedades, metadata, permissões e
  leitura atrasada multiloja. Responsivo cobre 320/390/1440 px e teclado.
- CI exige `PROXY_PRISMA_ARTIFACT_VERIFIED`, `MIGRATION_SKIPPED` e
  `MIGRATION_AUTHORITY_ENABLED=false`. Dados exclusivamente sintéticos.
- Revisão do executor é autorrevisão. Revisão independente, merge, Ready, buildId
  e smoke produtivo dependem de evidências reais registradas na PR/relatório final.

## Fronteiras e necessidades futuras

PRs/WIPs existentes de PDV N5-C (#299), Operações (#290), Pessoas (#273/#305) e
Fiscal foram preservados. Sem sobreposição intencional com seus arquivos reservados.

Produção/receitas e consumo de insumos; validade/lotes/alertas; perdas/descartes;
PLU/protocolo/etiquetas/balança; operação fracionada no PDV/estoque; grade comercial;
importação/planilhas; câmera/QR/voz/IA; Fiscal/Financeiro/Marketplace permanecem
necessidades de trilhas próprias. Nenhum botão novo promete essas funcionalidades.

`PRODUCTION_APPLICATION_WRITES=0` · `SCHEMA_MIGRATIONS=UNCHANGED` ·
`REAL_CLIENT_PROVISIONED=NO` · `MIGRATION_AUTHORITY_ENABLED=false`.
