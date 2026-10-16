# CAD-R2-020 — solicitações e pendências administrativas

## Fluxo implementado

1. Operador ADMIN/SUPER_ADMIN autenticado escolhe a unidade autorizada e o cliente. Um encaminhamento interno pode ser registrado em POST /api/clientes/privacy-request, com header x-assistec-loja-id e JSON {clientId, kind}, sendo kind access, correction ou erasure. Não enviar documentos, identidade do titular, relato livre ou evidência no payload.
2. O servidor valida sessão, permissão, scope e existência do cliente. IDs de outra loja e IDs inexistentes produzem a mesma resposta 404.
3. A auditoria existente recebe cliente.privacy_request, IDs internos, tipo, ator canônico e PENDING_GOVERNANCE_REVIEW. identityVerified e retentionReviewed ficam false. O retorno 202 confirma somente esse encaminhamento, não atendimento do direito, envio de mensagem ou abertura de protocolo externo.
4. O responsável designado deve verificar legitimidade do solicitante, finalidade, autorização e vínculos/obrigações de retenção por procedimento administrativo aprovado. Não coletar cópias de documentos no log genérico. Não se inferem identidade verificada, consentimento ou base jurídica a partir de checkbox, uso do sistema ou role administrativa.
5. Correções operacionais já autorizadas usam updateCliente/ClientWriteService na loja correta e mantêm autoria. Não alterar documentos fiscais ou snapshots históricos através deste fluxo.
6. Exportação de dados para um titular e exclusão/anonimização dependem de decisão e procedimento específicos ainda não implementados. Não há endpoint de cumprimento automático; exclusões genéricas ficam 409. Inativação suspende cadastro e preserva histórico; não é exclusão nem anonimização.

Não há nesta entrega fila dedicada, notificação, prazo automático, envio de cópia ao titular ou ação de concluir solicitação. O registro auditável é uma referência interna para revisão humana. Não comunicar ao titular que a solicitação foi cumprida com base nesse registro.

## Definições pendentes — fail-closed

| Decisão | Responsável a designar | Estado/conduta até definição |
| --- | --- | --- |
| Controlador/operador por finalidade; responsável e canal oficial | Administração + assessoria jurídica | Contato existente não apresentado como encarregado formal; nenhuma designação inventada. |
| Bases jurídicas e eventual consentimento verificável por finalidade | Administração + assessoria jurídica | Sem consentimento presumido, checkbox fictício ou aceitação geral como fundamento. |
| Identificação/representação do titular e autorização de entrega | Administração + assessoria jurídica | Nenhuma exportação automática; solicitar procedimento verificado fora do log genérico. |
| Matriz de retenção por cadastro, OS, venda, fiscal, financeiro, auditoria e backup | Administração + assessoria jurídica/contábil | Sem prazos legais presumidos; preservar dados e snapshots; bloquear destruição. |
| Destinatários, operadores/suboperadores e integrações habilitadas | Administração | Inventário contratual a validar; não declarar ausência de venda/compartilhamento sem prova. |
| Escopo/formato/canal seguro para resposta de acesso e portabilidade | Administração + assessoria jurídica | Exportar no HUB continua indisponível; sem CSV/JSON massivo novo. |
| Execução individual de eliminação/anonimização, restauração e auditoria | Administração + equipe técnica, após decisão jurídica | Sem execução automática, migration ou schema; gate humano separado se necessário. |
| Tratamento de logs e caches históricos fora do navegador atualizado | Administração + operações | Nenhum purge externo ou de produção nesta entrega; revisão e execução própria autorizada. |

Essas pendências não são substituídas por testes de software. O comportamento de recusa/encaminhamento é deliberado e testado. A política publicada foi reduzida ao que o sistema e as evidências permitem afirmar, sem inventar prazos, bases jurídicas ou conformidade LGPD plena.
