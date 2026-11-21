# Revisão independente — hardening 002

INDEPENDENT_REVIEW=APPROVE

Revisor: agente independente /root/independent_kg_review, em modo somente leitura. Aprovação técnica do código; não é autorização humana de publicação, de alteração de credenciais/papéis ou de habilitação produtiva. Os resultados finais de build/E2E ficam no relatório de validação separado.

O revisor solicitou mudanças nas primeiras rodadas. Foram corrigidos e reexaminados:

1. Devolução antiga sem referência podia repor KG/emitir crédito: barreira também na linha por produto da loja, inclusive flags de peso legadas, e guard local antes dos efeitos.
2. Correção antiga criava título em transação separada antes do guard da Venda: barreira em títulos por FK/localKey/payload e referências financeiras indiretas.
3. Autoridade RLS/search_path: SECURITY DEFINER, resolução fixada, preflight de ownership/FORCE RLS e prova com runtime que não enxerga a Venda.
4. Cache V1/V2 conservava peso/total antigos após correção: projeção canônica e confirmação autenticada do snapshot atual antes dos efeitos.
5. Respostas fora de ordem regrediam revisão ou reabriam cancelada: seleção monotônica compartilhada pelo merge, delta e confirmação; revisão incrementada no cancelamento e estado terminal.
6. Resposta em voo podia afetar outra loja: validação antes/depois do GET, no updater, nos erros e no fallback V2→V1.
7. Delta de projeção atingia outro dia/sessão: filtros independentes por data do ledger e sessão ativa; crédito/estoque são relidos.
8. E2E revelou data ausente no payload de uma venda por API: KG projeta a data real da coluna, e o filtro tolera ausência. Há regressão automatizada e nova revisão do delta.

Parecer final do revisor: “Conferi o delta: KG usa a data da coluna do banco, o filtro diário tolera data ausente e há teste de regressão correspondente. Não identifiquei novo P0/P1.”

Devolução parcial e recovery histórico de KG ausente continuam bloqueados. Cliente Prisma antigo continua incompatível com leitura KG; UN mantém compatibilidade. A correção aprovada tem a restrição documentada de um item KG, dinheiro e ausência de desconto/vínculos incompatíveis.
