# Decisão de perfis — OMNI-GESTAO-GASTOS-001

Data: 19/10/2026. Decisão de produto explicitamente aprovada pelo comando humano G001. Este delta substitui a proposta PESSOAL por usuário+loja do pacote OMNI-GESTAO-GASTOS-WHATSAPP-PLANO-001 revisão 2; o restante do plano permanece vigente.

## Domínio e autorização

`FinanceiroPerfil` tem duas composições mutuamente exclusivas, validadas por CHECK PostgreSQL:

- EMPRESA: `storeId` real obrigatório e único, `ownerAdminUserId` nulo. Um perfil por Store. Não há loja fictícia ou fallback.
- PESSOAL: `ownerAdminUserId` obrigatório e único, `storeId` nulo. Um perfil por AdminUser, independente da loja ativa. Trocar/perder empresa não altera ownership, identificador, conta ou documento pessoal. Outro administrador, SUPER_ADMIN ou gestor da loja não recebe acesso.

As duas identidades opcionais usam UNIQUE (NULL nos perfis do outro tipo) e FK RESTRICT para evitar transferência/deleção implícita. A migração não cria perfis, não escolhe donos e não reclassifica histórico.

`PerfilMembro` concede acesso somente ao perfil EMPRESA. FK composta `(perfilId, storeId)` exige o mesmo perfil/loja; FK `(adminUserId, storeId)` aponta ao vínculo real `AdminUserStore`. Perfil PESSOAL nunca aceita membro delegado. A exclusão do vínculo de loja elimina o membro financeiro; sua recriação não restaura concessão financeira. `revogadoEm` permite revogar somente o acesso financeiro. Permissões view/edit continuam as da matriz enterprise, sem nova hierarquia de papéis.

O contexto de domínio é uma união discriminada: EMPRESA contém storeId; PESSOAL contém ownerAdminUserId e não aceita storeId. Apenas sessão do servidor com AdminUser ativo no banco pode resolvê-lo. Para empresa, somar permissão atual de Financeiro, acesso da sessão e membership financeiro/loja atual; ADMIN não ignora membership financeiro. Para pessoal, exigir dono exato e permissão atual de Financeiro, sem consultar loja ativa ou gestores. A matriz de papéis existente não é alterada neste GOAL.

O contexto emitido é opaco em TypeScript, imutável e reconhecido em runtime; objeto/clonagem/JSON fornecido pelo cliente não é contexto autorizado. Revalidação recarrega sessão, usuário, perfil e vínculos; contexto de outra sessão não pode ser reaproveitado. Esse token interno não é credencial serializável nem substitui revalidação transacional dos futuros writers. A revogação após uma leitura não desfaz uma leitura já concluída; G004/G006/G007 devem revalidar dentro da unidade de aplicação/claim.

## E24 e WhatsApp de atendimento

E24 persiste no SHA base: read/write aceitam qualquer storeId resolvido após auth(), sem guard enterprise ou permissão do HUB. Corrigir usando os guards/permissões existentes e estado atual do AdminUser. Usuário não administrador exige AdminUserStore atual, sem fallback de loja primária que restaure membership revogada. Administradores globais preservam a autorização global já definida pela matriz enterprise, conferida no banco, para lojas reais e HUB WhatsApp autorizado; isso não concede qualquer acesso PESSOAL ou membership financeiro. O canal pessoal de gestão/binding continua G007. Nenhum envio externo é executado aqui.

## Consequências obrigatórias para G002–G010

| GOAL | Delta executável; sem implementação nesta etapa |
|---|---|
| G002 | Writers/contas/categorias recebem união autorizada. Entidades pessoais não podem continuar sob FK obrigatória Store: projetar persistência pessoal explícita (perfil/owner), mantendo storeId obrigatório/filtros para empresa. Nunca remover filtro empresarial ou usar loja fictícia. Contas pessoais pertencem ao perfil global e não migram com a loja ativa. Backfill atribui apenas EMPRESA inequívoca; dados ambíguos exigem decisão. |
| G003 | Inventário completo de readers/documentos/relatórios/logs/caches: empresa filtra perfil+loja; pessoal perfil+owner. Conta de outro perfil rejeitada. Downloads e índices privados independem de empresa. Cache usa usuário+perfil e empresa somente quando aplicável. Só habilitar dados pessoais depois de TODOS os writers/readers privados adaptados (G002/G003). |
| G004 | Operação/commandId/deduplicação por perfil, com loja apenas em EMPRESA. Revalidar identidade/vínculos na transação; título/pagamento/movimento/documento devem coincidir em perfil e escopo. Nunca atribuir pessoal ao sair de empresa. |
| G005 | Consulta recebe base, perfil e intervalo explícitos; serviços calculam totais. Distinguir pagamentos realizados (saída efetiva no caixa) de compras/despesas registradas (fato/obrigação, mesmo ainda não paga). Base inicial continua CAIXA; não somar compra+baixa como duas saídas. Categorias não convertem obrigação em pagamento. Implementação e massa reconciliada ficam integralmente em G005. |
| G006 | Inbox/job/outbox têm escopo discriminado: privado por usuário/binding antes da seleção; pessoal global por perfil/owner; empresa por perfil/loja. FKs/indexação e leases não exigem loja fictícia. Revalidar no claim/aplicação. |
| G007 | Telefone verifica identidade AdminUser uma vez; empresas autorizadas e pessoal são contextos distintos. Remover membership de empresa não revoga propriedade pessoal nem libera gestores. Número central GESTAO resolve usuário antes do contexto; ATENDIMENTO permanece por loja. O entrypoint G001 exige sessão web; G007 deve acrescentar entrada interna com principal autenticado pelo binding, reutilizando as mesmas verificações de banco, sem fabricar sessão/aceitar userId do remetente como autorização e sem exigir navegador aberto. Essa entrada ainda não existe nem é aceite PASS de G001. |
| G008 | Conversa pode alternar EMPRESA L1/L2 e o mesmo PESSOAL; ambiguidade exige pergunta. Correção/troca não copia objetos entre perfis; contexto de confirmação precisa coincidir e ser revalidado. |
| G009 | Áudio/transcrição/provedor e armazenamento privados por usuário/perfil; proibir logs/credenciais que exponham pessoal a gestores. Processamento não depende da loja ativa. |
| G010 | Foto+áudio/mensagem e documento único no perfil correto; E2E inclui saída/perda de empresa com pessoal preservado, gestores sem acesso e totais por base sem dupla contagem. Fechamento mantém A01–A20 integrais. |

G001 cria apenas a fundação dormente. Nenhuma rota, Action, writer, reader, UI, comando Agent ou canal recebe dados financeiros pessoais novos. A correção E24 é restrita ao acesso ao WhatsApp HUB existente. G011/G012 continuam futuros rascunhos sem efeitos financeiros/operacionais até finalização humana.

## Notas da revisão R para G002/G003 (sem iniciar essas etapas)

- O reconhecimento do contexto por WeakSet é local à instância do módulo. G002 deve emitir e revalidar na mesma camada do servidor, ou obter contexto novo por requireFinanceiroPerfilAccess em cada entrada autenticada. Não transportar esse objeto entre bundles, serializar, persistir, reconstruir por cast ou usar cache de contexto como autorização. G007 deve fornecer seu principal de binding pela entrada interna própria já prevista.
- RLS não tem políticas públicas nem FORCE. O teste usa SET LOCAL ROLE gastos_g001_anon e comprova o papel efetivo e leitura zero; a conexão de preparação privilegiada não é a identidade efetiva dessa leitura. Isso não comprova os privilégios do papel Prisma de produção. Antes da ativação G002/G003, conferir o papel real do runtime em homologação: com este SQL sem políticas, somente owner/BYPASSRLS lê as tabelas. Se migration e runtime usam papéis distintos, planejar políticas internas estritas sob gate próprio; não conceder BYPASSRLS genérico ou acesso público para contornar a restrição. Nenhum papel/grant de produção foi alterado em G001.
- G002 é responsável pelo serviço interno e fluxo governado de provisionamento idempotente do perfil EMPRESA e concessão/revogação de PerfilMembro. Deve definir e testar a autoridade de concessão com sessão, permissão financeira e vínculo de loja atuais, com auditoria, antes de ativar o fluxo. Não inferir membership de ADMIN/global nem criar grants em massa por default. A criação de perfil PESSOAL deverá usar exclusivamente o dono autenticado, sem seleção livre de owner; concorrer e repetir não cria segundo perfil. G001 não fez provisionamento/backfill.
- FKs RESTRICT preservam a identidade e impedem excluir Store/AdminUser que possuam perfil. G002/G003 devem conferir os fluxos de exclusão e definir inativação/retenção e o procedimento autorizado de eliminação, sem transferir pessoal a empresa, remover FKs, apagar perfis para destravar exclusões ou introduzir cascade financeiro silencioso. Essa preparação não autoriza apagar dados reais.
- A prova de dormência é o diff e a ausência de consumidores de lib/gastos em rotas/Actions/UI; contagens vazias das fixtures comprovam apenas que a execução daquela massa não criou efeitos financeiros/operacionais.

## Aceites e fronteira de evidência

A matriz detalhada de atribuição está no GOAL desta execução. A01–A03 não significam OTP, mídia ou worker em G001. Aqui se comprova identidade, ownership, autorização, composição e isolamento no banco/guard. G002/G003 comprovam todos os consumidores; G007 comprova vínculo/canal; G010 integra os aceites, sem marcar testes futuros como PASS.
