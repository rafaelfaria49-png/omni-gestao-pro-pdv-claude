# Primeiro acesso da loja piloto

Missão de configuração inicial sobre `0adec2121ed463844f1af325f05f924f6952eddf`,
main efetiva conferida em 23/10/2026. Branch isolada
`codex/piloto-primeiro-acesso-padaria`. AEP opt-in ausente. Sem novo GOAL,
numeração CAD-R2, alteração de índices concorrentes ou reabertura de PRs anteriores.

## Comportamento

O FirstAccessWizard continua montado pelo DashboardClientLayout. A elegibilidade
usa nome e CNPJ confirmados pelo reader remoto da própria unidade, conforme o
contrato existente. Lojas já completas não recebem obrigação de refazer o fluxo.
Ramo e recursos são apresentados pelo useStoreBusiness, incluindo a disponibilidade
canônica de peso/grade. O assistente não altera ramo, overrides, módulos ou PDV.

Assistente e Configurações → Geral compartilham `use-store-basics` e `store-basics`:

- Os readers oficiais da loja e de StoreSettings precisam concluir antes de editar.
  Telefone, endereço e contatos são hidratados juntos. Erro, envelope ausente ou
  identidade divergente não viram formulário vazio gravável.
- O editor é remontado por usuário, versão de sessão e loja. AbortController
  invalida leituras e as etapas ainda não despachadas do salvamento anterior.
  Revalidações de providers não substituem o preenchimento em andamento.
- Somente diferenças em relação à leitura inicial viram intenção de edição.
  Não há envio de logo, perfil, plano, módulos, capabilities, layout ou configurações.
  Limpar um campo editável significa alterá-lo explicitamente para vazio.
- Cada tentativa relê os dois readers autorizados antes de escrever. Campos
  persistidos que já correspondem à intenção deixam de ser reenviados. Endereço
  conserva chaves não expostas a partir da releitura atual.
- As duas chamadas PUT existentes são sequenciais. Não há transação entre HTTPs,
  writer paralelo ou nova fonte de Store/StoreSettings. Uma falha interrompe o
  despacho seguinte e leva à reconciliação pelos readers.
- A confirmação depende da releitura dos dois conjuntos e da correspondência dos
  campos pretendidos. Resposta perdida após commit pode ser resolvida sem repetir
  PUT. Resultado incompleto/incerto conserva o formulário, informa a limitação e
  obriga nova releitura antes de qualquer tentativa posterior.
- Uma referência síncrona bloqueia submissões concorrentes. Trocar de escopo
  descarta o formulário e impede que uma resposta antiga atualize o novo editor.
- A releitura também reconfirma os campos obrigatórios que não foram editados.
  Fechar a confirmação desmonta o editor: tornar o cadastro incompleto novamente
  em Geral não reutiliza uma tela de sucesso antiga.

O wrapper do SessionProvider usa chave por identidade/versão. O provider NextAuth
inicializa seu estado apenas na montagem; sem essa chave, login por Server Action
mantinha a sessão cliente nula e o dashboard mostrava sessão encerrada. A mudança
é de montagem: mesmas id/versão conservam filhos e rascunhos; troca efetiva monta
a sessão recebida do servidor. Políticas, guards e autenticação não foram alterados.

“Voltar depois” é dispensa local ao componente daquela identidade/unidade,
com ação de retomada enquanto incompleta. Não é conclusão. Não são persistidos
rascunhos, dados cadastrais ou senhas em storage/URL/log. Reabrir uma sessão lê o
que efetivamente foi salvo. Contatos são opcionais no contrato atual; dados não
salvos precisam ser preenchidos novamente se o componente/sessão for encerrado.

A conclusão oferece os caminhos oficiais de Cadastros, Clientes e Geral,
condicionados às permissões atuais. A orientação confirma apenas os dados básicos.
Não exige emissão fiscal, impressão, operação de balança ou venda de teste.

## Provas

`e2e/platform-pilot/first-access.spec.ts` é dedicado e não instala o helper que
dispensa automaticamente o assistente. O caminho principal usa provisionamento
pela tela existente, credencial temporária apenas em memória, contexto separado,
NextAuth real, troca obrigatória, novo login, assistente completo, produto unitário,
busca/reabertura, logout e nova sessão. Não há mocks de autenticação, writers ou
persistência nesse caminho.

Cenários separados injetam falha nos contatos e perda de resposta após o writer
real. Conferem uma tentativa ativa, reconciliação, preservação de logo/endereço/
contatos/configurações/autoridade, troca A→B durante leitura, identidade,
permissões negativas e desktop/390/320 px com labels, teclado e overflow.
O proprietário legado sintético conserva autoridade de plataforma.

O runner existente mantém identidade positiva e vacuidade do PostgreSQL descartável
antes de DDL/fixtures. Usa build de produção e next start, sem .env produtivo.
O teste dedicado desliga traces, vídeos e screenshots automáticos e preenche
senhas por evento, sem valores em call logs. Capturas manuais só ocorrem depois
das etapas com credenciais. Nenhum storageState é exportado.

Validação local: 18 testes de dados básicos/hook, assistente e montagem da sessão
aprovados e lint focado
sem erros. Os gates de TypeScript, regressões de Plataforma/Cadastros, build e E2E
integrados estão no CI. O build exige `PROXY_PRISMA_ARTIFACT_VERIFIED` e
`MIGRATION_SKIPPED`, preservando a correção #303. Resultados finais, SHA revisado,
PR, CI e publicação são registrados na PR e no encerramento da missão.

## Fronteiras e ativação real

Sem mudança de schema/migrations, autenticação/política de autoridade, PDV,
StockLedger, pesagem, hardware, Fiscal, Financeiro, vCard/QR ou voz.
Escritas de aplicação em produção: zero. Cliente real não provisionada.

Para provisionar posteriormente: nome da loja, nome do responsável e email de
acesso; a loja informa nome e CNPJ no cadastro básico existente, com endereço e
contatos opcionais. Não foram inventados dados reais de cliente.
