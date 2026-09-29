# Contratos backend Pessoas 001A para a UI

## Ativação e escopo

- `PESSOAS_DP_ENABLED=on` no servidor; default OFF. OFF devolve `PESSOAS_DESABILITADO` e não consulta dados DP.
- São necessárias chaves server-side distintas `PESSOAS_CPF_ENC_KEY`, `PESSOAS_CPF_HMAC_KEY` e `PESSOAS_DOCUMENT_INTENT_KEY`, cada uma com 32 bytes em base64 canônico. Ausência bloqueia a operação dependente. Rotação da chave HMAC do CPF exige reindexação controlada antes de uso; rotação da chave de cifra exige recifra.
- `PESSOAS_STORAGE_PROVIDER=r2` habilita o transporte privado; credenciais R2 existentes permanecem server-side. O bucket precisa ser privado. Nenhuma variável DP usa `NEXT_PUBLIC_`.
- Store vem exclusivamente do cookie de loja ativa e é conferida com `AdminUser.lojaId` ou `AdminUserStore` no banco a cada chamada. `empregadorId` recebido seleciona o objeto; não concede acesso. `DpAcesso` vigente + mapeamento vigente + capacidade são obrigatórios.

## Server Actions

Arquivo: `app/actions/pessoas/index.ts`. Todas retornam `{ok:true,data}` ou `{ok:false,code}`; erros inesperados viram `FALHA_INTERNA` sem stack/PII.

| Domínio | Actions |
| --- | --- |
| Empregador | `setupEmpregador`, `listarEmpregadores`, `obterEmpregador`, `editarEmpregador` |
| Estabelecimento e Store | `criarEstabelecimento`, `editarEstabelecimento`, `vincularUnidade` |
| Grants | `concederAcesso`, `revogarAcesso` |
| Cadastro | `criarFuncionario`, `listarFuncionarios`, `obterFuncionario`, `atualizarDadosPessoais`, `completarVinculoRascunho`, `criarVersaoContrato`, `listarHistorico`, `arquivarVinculo`, `vincularIdentidade` |

Comandos exigem `comandoId` ASCII de 8–100 caracteres (UUID recomendado) e `motivo` quando aplicável. Repetição idêntica é idempotente; mesma chave com payload diferente devolve `IDEMPOTENCIA_CONFLITO`. Edições versionadas exigem `expectedVersion`; contrato também exige `supersedesId` e `tipoMudanca: ALTERACAO|CORRECAO`. Conflito devolve `VERSION_CONFLICT`, `SUPERSESSAO_INVALIDA` ou `VIGENCIA_SOBREPOSTA`. O cliente deve reler a ficha e pedir decisão humana; não fazer overwrite silencioso.

Datas civis entram/saem como `AAAA-MM-DD`, sem horário. Dinheiro entra como string decimal canônica de duas casas, por exemplo `"2500.00"`; números JS e vírgulas são recusados. CPF pode vir formatado e é normalizado; não deve ser usado em URL. Rascunho tem `status: RASCUNHO`, campos nulos e `pendencias[]`; `ATIVO` requer dados mínimos completos. A admissão original é entrada explícita, inclusive para empregados existentes.

`listarFuncionarios` e `obterFuncionario` exigem `viewCadastro`. Sem `viewRemuneracao`, `salarioBase: null` e `remuneracaoOculta: true`; null não deve ser interpretado como salário zero. `editContrato` só é concedido junto de `viewRemuneracao` e `viewCadastro`. `viewDocumento` é grant separado.

## API privada de documentos

- `POST /api/pessoas/documentos/upload-intent`: body `{empregadorId,vinculoId,categoria,origem,nomeArquivo,mime,bytes,sha256}`. Devolve `signedUrl`, `headersObrigatorios`, `expiresInSec`, `documentoId`, `uploadIntent`. O cliente faz PUT bruto na URL com os headers assinados; não persistir/logar a URL ou token.
- `POST /api/pessoas/documentos/complete`: body `{uploadIntent}`. Revalida sessão/grant/Store e o objeto físico; devolve metadados sem `storageRef`. O intent expira em 10 minutos. Para retry idêntico, usar o mesmo intent dentro dessa janela.
- `GET /api/pessoas/documentos?empregadorId=...&vinculoId=...`: lista metadados autorizados.
- `POST /api/pessoas/documentos/{id}/download`: body `{empregadorId}`. Devolve URL assinada por até 300 segundos após nova autorização e auditoria.

Categorias aceitas: `contrato`, `identificacao`, `holerite_externo`, `comprovante`, `outro`. MIME/extensão: PDF, PNG, JPG; limite 25 MiB. Arquivos de saúde não são aceitos. Todas as respostas são `private, no-store`; o frontend 001B deve manter esses dados fora de cache persistente/offline.

## Estados e limitações para a interface

Exibir distinção entre vazio real, flag OFF, falta de grant, chave/storage indisponível, rascunho e conflito de versão. Não mostrar ação de folha nem botão de holerite próprio no 001B sem GOAL 002/003. `CONTADOR_EXTERNO` indica procedência documental, nunca cálculo ou publicação oficial do Omni.
