# Pessoas/DP — delta de implementação 001A

- Fonte preservada: [masterplan de 15/09/2026](./OMNIGESTAO_PESSOAS_DP_RH_MASTERPLAN_2026-09-15.md), SHA-256 `FF10E005E65B1AD504CCEFF4645D7C7E9AA218AD3EAACB10C363BBAC76C82A99`.
- Base: `origin/main` em `77111da450c7d0d2610ec5b1533b6975b2fd0b5d`.
- PESSOAS-000: busca pontual não encontrou `lib/pessoas`, `app/actions/pessoas`, `app/api/pessoas` ou trilha Pessoas na base. O Contador guarda arquivos de categoria folha, mas não possui cadastro de empregados nem cálculo. A arquitetura do plano foi ratificada para este recorte.
- PESSOAS-001A: backend e persistência cadastral, com autorização DP e documentos privados. PESSOAS-001B continua pendente de escolha humana da IA para UI e aceite visual. O GOAL 001 completo não é declarado DONE por este delta.

## Decisões do recorte

1. `DpEmpregador` não é `Store`. A identificação legal é versionada; mesmo identificador em Stores gestoras diferentes não une empregadores. `DpUnidadeVinculo` mapeia Store e estabelecimento por ação explícita; o primeiro setup exige administrador ativo com `AdminUser.lojaId` ou `AdminUserStore` da Store. Papel administrativo sem vínculo não basta.
2. Funcionário é `DpPessoa` + `DpVinculo`. `AdminUser` e `Tecnico` são associações opcionais, tipadas e verificadas pela Store. CPF é cifrado em AES-256-GCM com AAD do empregador e indexado por HMAC-SHA256 escopado. Não há deduplicação global. Matrícula é única no empregador.
3. O salário editável existe somente em `DpContratoVersao`, `Decimal(18,2)`. Versões registram vigência civil, instante, ator, motivo e predecessor. Uma versão atual por vínculo é protegida por índice parcial; CAS e transação serializável resolvem concorrência. Alteração em data posterior e correção na mesma data usam comandos explícitos. Versão anterior permanece como evidência, marcada como supersedida; o fim efetivo do segmento aberto é derivado da próxima versão válida. O histórico salarial vem dessas versões.
4. Rascunho permite campos nulos e lista pendências; não inventa admissão. Uma admissão já registrada só pode ser preenchida a partir de NULL, não alterada por edição comum. Correção excepcional futura exigirá fluxo próprio auditado.
5. Grants `DpAcesso` são dedicados, revogáveis e revalidados por request. `viewRemuneracao` não deriva de Financeiro, gerente ou `FULL`. A flag `PESSOAS_DP_ENABLED` é server-side e aceita somente `on`; ausente ou outro valor recusa antes de consultar DP.
6. Auditoria do comando e mutação ficam na mesma transação. `(storeId, atorId, comandoId)` é único; payload de idempotência é HMAC, sem PII em claro. `DpAuditoria`, versões pessoais e documentos são append-only via trigger. O banco bloqueia inserções operacionais em Store não mapeada.
7. Documento usa namespace `pessoas/{empregadorId}/{storeId}/{documentoId}` no transporte privado R2 já existente. Intent assinado por chave DP própria vincula usuário, Store, dono e metadados; confirmação relê bytes, verifica tamanho, SHA-256 e assinatura de arquivo. `holerite_externo` é sempre origem `CONTADOR_EXTERNO`, sem se tornar holerite calculado pelo Omni.

## Adiado explicitamente

- `DpDependenteVersao` e `DpParametroVinculoVersao`: entram com finalidade, campos tipados, regras e comprovações do GOAL 002; não coletar dependentes ou autorizações de desconto sem uso definido no cadastro mínimo. O 001A não afirma aptidão para cálculo.
- Dados de saúde, biometria, raça, sindicato, bancários e documentos dessas classes: não coletados neste backend. ACL especializada e retenção precisam de GOAL específico.
- Folha, rubricas, regras legais, fechamento, PDF/holerite próprio, pagamento e integrações Financeiro/Contador: GOALs 002–004 conforme o masterplan.
- Transferência entre empregadores, correção de admissão já consolidada, compartilhamento de identidade pessoal entre Stores e vínculos futuros agendados: comandos simplificados bloqueados até desenho auditado.

## Revisão e operação

A migration é aditiva. As variáveis DP em `.env.example` aparecem só por nome; chaves e configurações reais devem ser provisionadas no servidor antes de ligar a flag. Nenhum dado de produção, bucket de produção ou migration de produção foi usado. Revisão independente e autorização humana precedem merge ou aplicação em produção.
