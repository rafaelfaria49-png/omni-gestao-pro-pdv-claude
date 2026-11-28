# OMNI-GESTAO-GASTOS-003 — Leituras e documentos privados

Base vinculante: G001 `55bab9a7a93218433912761d6ce2f07b8b3fdfad` e fechamento/R5 G002 `bcde32ca83a216c512e5234d599a4bd8471869b0`. Esta decisão descreve a implementação local; os gates de encerramento constam no relatório e ainda precisam ser satisfeitos antes do commit.

## Autoridade e escopo de leitura

O contexto pessoal continua opaco e não serializável como autoridade. `comLeituraFinanceira` revalida G001 e abre snapshot PostgreSQL RepeatableRead, READ ONLY, reconferindo usuário ativo, permissão, perfil/dono e, na empresa, membership/grant. PESSOAL pertence ao AdminUser global e tem storeId NULL; troca/perda de loja não muda seu dono. Nenhuma API ou interface pessoal é ativada.

O reader empresarial legado exige loja real, identidade e acesso atual no servidor. `leituraEmpresaWhere` é apenas um predicado SQL: intersecciona a loja com perfil empresarial ou legado perfilId NULL da mesma loja; não concede acesso. Nenhuma leitura provisiona perfil, membro, carteira ou adoção de histórico. Identidade ausente, primeira loja/carteira e storeId do cliente não são fallbacks de autorização. Isso recusa sessões legadas sem identidade nos readers financeiros protegidos; implantação futura deve assegurar a identidade/membership reais, sem autoatribuição.

Os GETs financeiros mantêm suas permissões específicas e recebem guard vivo/no-store/erro seguro. GET venda acrescenta explicitamente identidade/membership/papel atuais e `hubs.vendas`, ausentes no baseline que validava apenas a loja; a confirmacao dos consumidores comerciais/caixa/OS consta abaixo, com fontes e testes reais. Caixa, dashboard e projeção OS usam suas permissões operacionais e fontes empresariais. Predicados dos readers não mudam os corpos dos writers G002, locks, M1 ou N10/N11.

Contador interno revalida ator, membership, permissão e grant antes da carga real. O portal externo conserva a identidade própria: cookie HMAC, sessão revogável e ContadorAcesso ativo da loja; um scope JSON não substitui esse request. A revalidação do reader reaproveita o validador existente com porta sem toque/renovação de sessão, deixando tais metadados no guard HTTP existente. Helpers de agregação com porta injetada continuam puros. Nenhum desses caminhos inclui PESSOAL.

## Pré-condição de implantação — grant EMPRESA explícito

O writer legado G002 pode criar FinanceiroPerfil EMPRESA sem PerfilMembro; essa decisão G002 permanece intacta. Enquanto não existe perfil, o reader legado aceita somente usuário atual, membership real da loja e permissão vigente. Após o writer criar o perfil, o G003 exige também o grant atual: sem PerfilMembro ativo o mesmo reader passa a 403. Leitura não provisiona grants, não adota dados e não promove administrador automaticamente.

**Qualquer implantação do G003 está condicionada a concessão/revisão explícita dos grants por operador autorizado antes de liberar os readers para usuários.** O ensaio de transição demonstra 200 → writer real G002 → 403 sem grant → 200 após grant explícito de fixture, preservando o legado NULL. Não há concessão, backfill, SQL ou implantação produtivos neste GOAL. Essa condição bloqueia implantação; não exige G004 para concluir o commit local autorizado. Alterar esse contrato de autorização exigiria decisão humana específica.

## Documentos

DocumentoGasto/DocumentoVinculo são aditivos aos modelos canônicos. Documento tem dono/perfil/loja coerentes, criador, nome, MIME, bytes, hash, proveniência, path privado durável, estado, versão e histórico. O servidor deriva MIME/tamanho/hash dos bytes; não realiza validação completa de codecs, antivírus, visão ou OCR nesta etapa. Limite de 10 MiB e tipos PDF/PNG/JPEG/texto simples. Identidade, path, conteúdo e histórico anterior são imutáveis por constraints/triggers. Deduplicação somente por perfil+hash.

Vínculo aponta para exatamente um alvo existente (pagar, receber, carteira ou movimento), do mesmo perfil/loja. Alvo empresarial legado NULL pode ser vinculado na mesma loja sem ser adotado. FK RESTRICT conserva as referências; novo vínculo não aceita alvo inativo ou documento em quarentena. Não há FK fictícia para Gasto/Operação G004.

Somente a porta compatível de storage **fixture** é liberada. Não há bucket, credencial, rede ou mídia WhatsApp real. Paths são gerados no servidor e verificados no consumo; DTO comum não contém owner, hash ou storageRef. Download exige autorização e verificação de integridade antes de emitir capability opaca com TTL máximo de 60 segundos, sem persistir URL. A capability é temporária e deve ser tratada como segredo por quem a recebe; não se afirma reautenticação por sessão no consumo da URL fixture.

Órfãos com pelo menos 24 horas entram em quarentena, com revisão em 30 dias e histórico incrementado. Vínculo e quarentena serializam no mesmo lock de documento. Não se apagam bytes, vínculos ou histórico financeiro. Documentos vinculados têm retenção indeterminada até política futura aprovada; não há job produtivo novo.

A quarentena é terminal na fundação atual: reenviar os mesmos bytes devolve o documento deduplicado ainda em QUARENTENA, sem download ou novo vínculo. Não há reativação automática ou UI de revisão; uma transição futura precisará de política e trilha próprias. Nenhuma API G003 apaga documentos/vínculos, mas o SQL owner ainda pode executar DELETE/TRUNCATE: os triggers atuais protegem identidade e histórico no UPDATE, não defendem contra esses comandos privilegiados. Não se certifica retenção contra abuso do owner PostgreSQL; os ensaios usam esse privilégio somente para limpar suas fixtures.

A auditoria comum foi deliberadamente reduzida também na escrita: status, tipo/origem, valores/saldos/diferença e ação permanecem; descrições livres, anexos, IDs de perfil e conteúdo privado deixam de ser espelhados. A18 autoriza essa minimização, preservando evento/ator/data e os detalhes na origem autorizada quando existentes. Não se promete reconstruir detalhes já descartados. O delta R1 verifica conteúdo efetivamente gravado e retornado, além de histórico sintético não vazio.

O seletor de loja é estrito. Abas com lojas diferentes compartilham o cookie de loja ativa; uma delas pode receber 403. Um 401/403 invalida a geração do Provider até remontar por sessão/usuário/loja ou recarregar a página. É uma limitação de recuperação em múltiplas abas, com descarte fail-closed dos dados anteriores; não se afirma recuperação automática sem remontagem.

## Exposição, cache e evidência

Relatórios, DRE, fluxo, analytics, exports CSV/XLSX e Contador recebem fontes empresariais filtradas. Regras contábeis foram preservadas. A14 comprova privacidade e procedência no G003; a reconciliação numérica integral permanece no G005.

Auditoria comum armazena/devolve somente snapshots técnicos permitidos; conteúdo, anexos e ownership pessoais não são espelhados. Documentos usam histórico privado próprio. Agent revalida resumo e histórico financeiro, restringe memória/timeline à loja autorizada e não cria automações ao listar. Não há novo assistente/canal pessoal.

HTTP privado/no-store cobre sucesso, negação, erro e exports. O Provider real remonta estado por sessão/usuário/loja; gerações descartam respostas atrasadas mesmo sem AbortSignal efetivo. 401/403 invalidam respostas concorrentes. A correção PWA autorizada acrescenta NetworkOnly, recusa de aquecimento e limpeza histórica das APIs/páginas financeiras inventariadas, inclusive Contador externo. O build oficial e a execução das funções efetivamente geradas confirmaram NetworkOnly, ordem de rotas, recusa de aquecimento e limpeza histórica para 21 URLs privadas, inclusive HTML/RSC real de /contador-externo/lojas/**. A prova em VM com CacheStorage sintético não é E2E de navegador.

O inventário separa queries operacionais, lookups transacionais dos writers preservados, funções puras, caches e manutencao offline excluida do produto operacional. O seed de contas OS foi executado somente no QA sintetico V3, identificado no inventario; nao houve manutencao produtiva. Testes com app owner são distintos dos ensaios com papel efetivo não owner/NOBYPASSRLS. RLS fechada nos dois modelos novos não é certificação de RLS produtiva: owner tem semântica própria e nenhum papel produtivo foi usado.

G004–G010 continuam reservados: aplicação financeira geral, estorno por operação, reconciliação integral, canal/mídia real, staging, modelos externos, STT/OCR e produção exigem suas etapas. O fechamento local exige retestes, typecheck integral, lint atual/diferencial, build MIGRATION_SKIPPED, R real Anthropic e um único commit local. Nada disso é presumido por esta decisão.

## Evidencia e decisoes apos R1

Os consumidores reais do GET venda sao o historico/correcao comercial e a conferencia de caixa/recibo; a matriz vigente concede hubs.vendas e hubs.caixaHistorico a ADMIN, GERENTE, CAIXA e VENDEDOR, todos positivos no GET PostgreSQL. TECNICO nao tem esses hubs e e recusado mesmo com token ADMIN antigo. Sua consulta de OS usa lerProjecaoFinanceiraOSV4, positiva ADMIN/TECNICO pelo gate operacoes.editarOs. components/operacoes/lovable/api/vendas.ts usa Server Actions, sem o GET comercial. Mapa de fontes/hashes/linhas em E/r1-f4-consumer-proof.json; sem alegacao de navegador E2E.

A auditoria historica polimorfica podia ter storeId L1 com entidade PESSOAL ou de outra loja. A consulta comum de lista/detalhe/export agora junta a fonte canonica no SQL, verifica loja/perfil e marcadores privados antes de carregar IDs/valores, inclusive a carteira da conciliacao. Origem inexistente/desconhecida conserva metadados do evento com entidadeId e snapshots NULL; detalhe exige origem comprovada e autorizada. Nao ha mutacao/backfill do historico ou mudanca no writer monetario. A perda de referencia/snapshot nao comprovavel e deliberada para nao expor origem privada.

A rodada focused-pg-r6 passou 122/122 com agregados de fonte conhecida, 24 exports, transicao real de grant, auditoria gravada/devolvida, dedup concorrente e falha DB apos upload/corrida de locks em ambas ordens. As 820 regressoes selecionadas, typecheck integral e novo build oficial tambem passaram; lint global continua BASELINE_FAIL e seu delta sem regressao exige aceite expresso R2. R1 real pediu alteracoes, foi preservado; resposta do executor nao substitui nova revisao independente.
