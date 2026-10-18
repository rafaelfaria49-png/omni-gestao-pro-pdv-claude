# CAD-R2-020 — inventário de PII e controles

Data: 15/10/2026. Escopo: superfícies ativas de Clientes no Cadastros HUB e seus adapters compartilhados. Fontes inspecionadas no código; nenhuma consulta a dados de clientes em produção.

## Matriz de operação e autorização

A identidade é obtida da sessão/entitlement. A loja informada pelo request só se torna scope após autorização server-side. ADMIN/SUPER_ADMIN mantêm o acesso global preexistente a uma loja explícita; demais papéis exigem membership restricted. Papéis ausentes/desconhecidos não herdam vendedor. O body não define principal, role ou store.

| Superfície | Dados/finalidade | Controle aplicado |
| --- | --- | --- |
| POST /api/clientes/search; hooks PDV/OS | Identificação/seleção comercial: id, nome, telefone, documento, tipo e atividade | Gate shared + loja; limite 50; corpo POST; no-store; nenhuma tag, email, documentKey ou histórico. Documento preservado para seleção/faturamento existente do PDV; não é uma nova permissão fiscal. |
| GET /api/clientes; alias /api/clients | Listagem do cadastro | Shared sem HUB recebe projeção comercial mínima; HUB recebe campos usados no cadastro, tags filtradas, limite 200. Alias deixa de fazer dump de todas as colunas. GET com q é recusado; consumidores ativos usam POST. |
| listClientes Server Action | Lista/edição HUB; seleção por outros adapters | Gate shared; sem HUB projeção mínima (50), com HUB DTO explícito (500). Metadados de origem, RG e financial não trafegam em tagsRaw. |
| GET /api/clientes/[id] | Atendimento/detalhe | findFirst id + store; shared sem HUB só identidade comercial; HUB usa projeções explícitas e filtra também OS/vendas por storeId. Sem documentKey, payload fiscal ou metadata histórico completo. |
| POST /api/clientes; PATCH /[id] | CRUD administrativo | admin + loja; ClientWriteService; respostas sem metadados privados; erros constantes, no-store. |
| createCliente/updateCliente Actions | Cadastro operacional / correção HUB | Gates shared/hub preexistentes; ClientWriteService e ator de sessão; erros inesperados genéricos. Opção interna tagsMode=editor preserva metadata não exibida dentro da transação canônica e impede sobrescrever chaves ocultas pelo editor. |
| POST /api/clientes/quick | Criação a partir do PDV | shared + loja; ClientWriteService; conjunto curto de identificação, sem tags/totais; nenhum erro bruto. |
| POST /api/clientes/match-by-phone | Vincular contato de atendimento | Telefone no corpo; matcher store-scoped; retorna apenas id/nome/telefone; sem eco normalizado nem email. GET legado 405. Nenhuma mensagem WhatsApp é enviada. |
| GET /api/clientes/duplicates | Revisão de duplicidade | Admin + loja; bounded; client-identity preservado; chave do grupo usa IDs, não documento/telefone/email. Dados dos membros restritos à revisão administrativa. |
| POST /merge/plan, /merge/execute | Decisão explícita de consolidação | Admin + loja; ClientMergeService, fingerprint, confirmação, transação, retenção de snapshots e autoria existentes preservados. Plano contém dados necessários à decisão administrativa; no-store. |
| /api/clientes/importar; /api/ops/import/clientes; app/clientes-import-actions.ts | Importação e listagem legada | Imports de Clientes exigem admin + scope; lista de cadastro exige HUB. Sem CORS refletido/credentialed. Sem stack, SQL, Prisma meta ou exceção em resposta. Leitura legada bounded e select explícito. |
| /api/import/validate/clientes | Validação de planilha | Admin + loja; documento inválido nunca é repetido na mensagem. |
| /api/import/advanced e persistidores genérico/Smart | Importação HUB multidomínio | Gate HUB + loja e principal canônico preservados; writers Clientes continuam no ClientWriteService. Logs Clientes usam linha/códigos, não chave pessoal; erros públicos sanitizados; auditoria não registra nomes dos arquivos. A permissão HUB desta operação existente foi preservada; não se criou novo importador. |
| Exportar no HUB | Recurso ainda não implementado | Continua indisponível. Texto explicita limitação; não se adicionou download em massa nem se apresenta acesso ao cadastro como atendimento automático de direito. |
| DELETE /[id], bulk-delete, bulk-action delete | Exclusão | Gate admin + loja, 409 RETENTION_REVIEW_REQUIRED, nenhuma exclusão física. CTA do HUB explica revisão; inativação continua via updateClientTx com autoria. |
| bulk-check-dependencies | Verificação administrativa de vínculos | Admin + loja; queries de relações também filtradas por store; sem documento no resultado e sem exceções brutas. É diagnóstico, não liberação de retenção. |
| POST /api/clientes/privacy-request | Encaminhamento interno de acesso/correção/exclusão | Admin + loja + existência scoped; log mínimo com ator canônico, tipo, cliente e status pendente; ignora nota livre, userLabel e identityVerified do caller; erro de auditoria não retorna sucesso. Não executa o direito. |
| listLogsAuditoriaCadastros/listImportacoesAuditoria | Leitura de auditoria | Permissão auditoria adicional ao HUB; scope por metadata; não retorna antes/depois, nomes de arquivos nem detalhe legado arbitrário. Autoria canônica preservada. |
| ClientWriteService / ClientMergeService / identity telemetry | Auditoria e erros | Auditoria registra ator, IDs scoped, nomes de campos, contagens/códigos e decisões; não valores de clientes. Telemetria copia lista fechada; exceções brutas não são logadas. Logger automático Prisma desativado, pois pode incluir argumentos de consultas. |
| Browser/PWA | Memória temporária e transporte | no-store/Pragma/Vary; regras NetworkOnly e bloqueio do worker de navegação; activate elimina respostas antigas de Clientes dos caches. Troca de loja remonta painel Clientes; hooks descartam respostas antigas. Sem persistência de dados de Clientes em localStorage/sessionStorage no HUB (somente tema). |
| Política /privacy e formulário | Informação ao usuário | Removidos consentimento implícito, checkbox sem persistência e promessas não comprovadas. Contato existente preservado com pendência de validação administrativa. |

## Limites examinados

- Captura natural/voz CAD-R2-016/017 nesta base é de Produto; não há fluxo ativo de Clientes conectado a esse interpretador. Nenhum provider foi provisionado ou chamado nesta execução.
- A cópia components/pdv-github-original é arquivo legado excluído do app/teste; não foi tratada como rota ativa.
- app/actions/backfill-venda-cliente.ts não tem consumidores no código ativo localizado; não foi executado/modificado. Motores de vínculos de vendas, PDV, estoque e financeiro permanecem fora deste GOAL.
- Dados necessários à operação (nome, telefone, documento de faturamento, endereço/observações editáveis) continuam visíveis a perfis autorizados. Esta entrega não equivale a mascaramento integral do cadastro nem a prevenção de cópia manual por operador autorizado.
- Nenhuma limpeza de logs históricos/backup, anonimização em massa, revisão fiscal histórica ou alteração em produção foi feita. Histórico já coletado exige decisão própria de retenção e execução autorizada.
- Solicitações legais, retenção e compartilhamentos externos têm pendências explícitas no GOVERNANCE.md. Não existe atestado de conformidade plena.
