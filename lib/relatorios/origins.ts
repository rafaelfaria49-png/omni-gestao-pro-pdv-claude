import "server-only"
import { Prisma } from "@/generated/prisma"
import type { Report,ReportKind,ReportQuery,Column,Cell } from "./contracts"
import { paginate,utcText,emptyArray,type ReportDb } from "./sql"

type Row=Record<string,Cell>
const period=(q:ReportQuery)=>`from=${q.from}&to=${q.to}`
export const originHref=(kind:ReportKind,id:string,q:ReportQuery)=>`/dashboard/relatorios/${kind}?source=${encodeURIComponent(id)}&${period(q)}${q.wallet?`&wallet=${encodeURIComponent(q.wallet)}`:""}${q.category?`&category=${encodeURIComponent(q.category)}`:""}`
function detail(kind:ReportKind,title:string,source:string,columns:Column[],rows:Row[],total:number,limitations:string[]=[]):Report {
  return {kind,title,basis:"Detalhamento somente leitura vinculado ao recorte e à loja autorizada.",source,
    limitations:["O detalhe não reconstrói estados anteriores. Não há comparação temporal de um identificador individual.",...limitations],
    metrics:[{key:"records",label:"Registros de origem vinculados",value:total,format:"number"}],columns,rows,total,trend:[]}
}
const lineColumns:Column[]=[{key:"sale",label:"Venda"},{key:"date",label:"Data",format:"date"},{key:"id",label:"ID da linha"},
  {key:"name",label:"Item registrado"},{key:"reference",label:"Referência gravada"},{key:"quantity",label:"Quantidade registrada",format:"number"},
  {key:"unit",label:"Preço unitário gravado",format:"money"},{key:"gross",label:"Total bruto da linha",format:"money"}]

/** The reducer's exact identity groups select persisted lines, including legacy aliases. */
export async function productOriginReport(db:ReportDb,storeId:string,q:ReportQuery,pairs:{inventoryId:string|null;nome:string}[]):Promise<Report> {
  const cte=Prisma.sql`WITH refs AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb) AS r("inventoryId" text,nome text)), lines AS (
    SELECT i.id,v."pedidoId" AS sale,${utcText(Prisma.sql`v.at`)} AS date,i.nome AS name,i."inventoryId" AS reference,
      i.quantidade::float8 AS quantity,i."precoUnitario"::float8 AS unit,i."lineTotal"::float8 AS gross,v.at
    FROM venda_itens i JOIN vendas v ON v.id=i."vendaId" AND v."storeId"=${storeId}
    WHERE v.at>=${q.start} AND v.at<${q.end} AND v.status<>'cancelada' AND EXISTS (
      SELECT 1 FROM refs r WHERE r."inventoryId" IS NOT DISTINCT FROM i."inventoryId" AND r.nome=i.nome)
  )`
  const [rows,count]=await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`${cte} SELECT id,sale,date,name,reference,quantity,unit,gross FROM lines ORDER BY at DESC,id ${paginate(q)}`),
    db.$queryRaw<{total:number}[]>(Prisma.sql`${cte} SELECT count(*)::int AS total FROM lines`),
  ])
  return detail("produtos","Linhas de vendas do produto","ItemVenda + Venda; identidade resolvida com as mesmas regras do ranking.",lineColumns,
    rows.map(r=>({...r,href:originHref("produtos",`venda:${r.sale}`,q)})),count[0].total,
    ["Cada linha física é exibida uma vez. Valores brutos gravados, sem rateio inventado de devoluções ou desconto geral. Consulte o ranking para a devolução limitada ao vendido e o líquido por produto.",
      "Referências de catálogo atuais não substituem o nome, o preço ou a quantidade histórica gravados. Quantidades sem unidade histórica comprovada não são convertidas em peso."])
}

async function saleOrigin(db:ReportDb,kind:ReportKind,storeId:string,q:ReportQuery):Promise<Report> {
  const sale=q.source.slice("venda:".length)
  const cte=Prisma.sql`WITH lines AS (
    SELECT i.id,v."pedidoId" AS sale,${utcText(Prisma.sql`v.at`)} AS date,i.nome AS name,i."inventoryId" AS reference,
      i.quantidade::float8 AS quantity,i."precoUnitario"::float8 AS unit,i."lineTotal"::float8 AS gross
    FROM vendas v JOIN venda_itens i ON i."vendaId"=v.id WHERE v."storeId"=${storeId} AND v."pedidoId"=${sale}
      AND v.at>=${q.start} AND v.at<${q.end} AND v.status<>'cancelada'
      AND (${kind!=="clientes"} OR EXISTS(SELECT 1 FROM clientes_importados c WHERE c.id=v."clienteId" AND c."storeId"=${storeId} AND c.id=${q.entity}))
  )`
  const [rows,count]=await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`${cte} SELECT * FROM lines ORDER BY id ${paginate(q)}`),
    db.$queryRaw<{total:number}[]>(Prisma.sql`${cte} SELECT count(*)::int AS total FROM lines`),
  ])
  return detail(kind,`Itens da venda ${sale}`,"Venda.pedidoId + ItemVenda.vendaId; FK do cliente da mesma loja quando acessado pelo histórico.",lineColumns,rows,count[0].total,
    ["Valores das linhas na venda original, sem ratear descontos gerais ou devoluções. O histórico/ranking apresenta os líquidos comprovados. Não representa recebimento de caixa.",
      "Sem contatos, documentos, dados de pagamento ou payload bruto do cliente."])
}

// Same classification as the partial cash-basis DRE. One SQL expression is shared.
export const dreClass=Prisma.sql`CASE
  WHEN lower(origem) ~ '^(estorno_receber|devolucao_|devolução_)' THEN 'Reversões de recebimentos'
  WHEN lower(origem) ~ '^estorno_pagar' THEN 'Reversões de pagamentos'
  WHEN tipo='entrada' AND lower(origem) ~ '^(receber|pdv$|venda$|os$|marketplace$)' THEN 'Recebimentos de clientes'
  WHEN tipo='saida' AND lower(origem) ~ '^pagar' THEN 'Pagamentos: ' || categoria
  ELSE 'Sem classificação de resultado' END`

async function financialOrigin(db:ReportDb,kind:ReportKind,storeId:string,q:ReportQuery):Promise<Report> {
  const cte=Prisma.sql`WITH records AS (
    SELECT m.id,m.tipo,m.origem,m.valor,m."referenciaId",m."createdAt",coalesce(c.nome,'Sem carteira') AS wallet,
      coalesce(nullif(p.payload->>'categoria',''),'Sem categoria') AS categoria
    FROM movimentacoes_financeiras m LEFT JOIN carteiras_financeiras c ON c.id=m."carteiraId" AND c."storeId"=${storeId}
    LEFT JOIN contas_pagar_titulos p ON p.id=m."referenciaId" AND p."storeId"=${storeId}
    WHERE m."storeId"=${storeId} AND m."createdAt">=${q.start} AND m."createdAt"<${q.end}
      AND (${q.wallet}='' OR m."carteiraId"=${q.wallet})
      AND (${q.category}='' OR coalesce(nullif(p.payload->>'categoria',''),'Sem categoria')=${q.category})
  ), filtered AS (SELECT *,${dreClass} AS class FROM records WHERE
    (${kind!=="fluxo-caixa"} OR id=${q.source}) AND (${kind!=="dre"} OR (lower(origem) NOT LIKE 'transfer%' AND origem NOT IN ('sangria_pdv','suprimento_pdv')))
  )`
  const condition=kind==="dre"?Prisma.sql`class=${q.source}`:Prisma.sql`true`
  const [rows,count]=await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`${cte} SELECT id,${utcText(Prisma.sql`"createdAt"`)} AS date,origem AS origin,tipo AS type,wallet,categoria AS category,
      "referenciaId" AS reference,valor::float8 AS amount,class FROM filtered WHERE ${condition} ORDER BY "createdAt" DESC,id ${paginate(q)}`),
    db.$queryRaw<{total:number}[]>(Prisma.sql`${cte} SELECT count(*)::int AS total FROM filtered WHERE ${condition}`),
  ])
  return detail(kind,kind==="dre"?`Movimentos: ${q.source}`:"Movimento identificado do ledger","MovimentacaoFinanceira.id; carteira e referência de título da mesma loja.",
    [{key:"id",label:"ID do movimento"},{key:"date",label:"Lançamento",format:"date"},{key:"origin",label:"Origem gravada"},{key:"type",label:"Direção"},
      {key:"wallet",label:"Carteira"},{key:"category",label:"Categoria"},{key:"reference",label:"ID de referência"},{key:"amount",label:"Valor registrado",format:"money"}],
    kind==="dre"?rows.map(r=>({...r,href:originHref("fluxo-caixa",String(r.id),q)})):rows,count[0].total,
    ["O valor e a direção são os do lançamento persistido. Não representam lucro, CMV nem competência. Descrições livres e payloads pessoais não são retornados."])
}

async function orderOrigin(db:ReportDb,storeId:string,q:ReportQuery):Promise<Report> {
  const cte=Prisma.sql`WITH authorized AS (SELECT id,numero,status,"createdAt",
    CASE WHEN payload->>'storeId'=${storeId} AND (payload->>'id' IS NULL OR payload->>'id'=id) THEN payload ELSE NULL END AS payload
    FROM ordens_servico WHERE "storeId"=${storeId} AND id=${q.source} AND "createdAt">=${q.start} AND "createdAt"<${q.end}), records AS (
    SELECT 'os:'||id AS id,'OS persistida' AS type,id AS reference,coalesce(numero,id) AS label,NULL::float8 AS quantity,${utcText(Prisma.sql`"createdAt"`)} AS date FROM authorized
    UNION ALL SELECT 'item:'||i.id,'Item persistido',i.id,i.descricao,i.quantidade::float8,NULL::text FROM ordem_servico_item i JOIN authorized a ON a.id=i."ordemServicoId"
    UNION ALL SELECT 'garantia:'||g.id,'Garantia: '||g.status,g.id,'Prazo: '||g."prazoDias"::text||' dias',NULL::float8,${utcText(Prisma.sql`g."dataInicio"`)} FROM garantia_ordem_servico g JOIN authorized a ON a.id=g."ordemServicoId" WHERE g."storeId"=${storeId}
    UNION ALL SELECT 'evento:'||a.id||':'||h.n::text,'Evento persistido',h.n::text,
      CASE WHEN h.event->>'tipo' IN ('garantia_acionada','status_alterado','orcamento_aprovado','os_entregue','estoque_baixado','estoque_restaurado') THEN h.event->>'tipo' ELSE 'Tipo sem classificação neste relatório' END,NULL::float8,NULL::text
      FROM authorized a CROSS JOIN LATERAL jsonb_array_elements(${emptyArray(Prisma.sql`a.payload->'timeline'`)}) WITH ORDINALITY h(event,n)
  )`
  const [rows,count]=await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`${cte} SELECT * FROM records ORDER BY id ${paginate(q)}`),
    db.$queryRaw<{total:number}[]>(Prisma.sql`${cte} SELECT count(*)::int AS total FROM records`),
  ])
  return detail("os","Registros de origem da OS","OrdemServico.id + OrdemServicoItem + GarantiaOrdemServico + tipos da timeline do payload canônico.",
    [{key:"type",label:"Registro"},{key:"reference",label:"ID / posição de origem"},{key:"label",label:"Item ou evento"},{key:"quantity",label:"Quantidade gravada",format:"number"},{key:"date",label:"Data persistida",format:"date"}],rows,count[0].total,
    ["A coorte é pela criação da OS. Itens, eventos e garantias refletem o registro atual; ocorrências fora do recorte podem aparecer no vínculo e não são somadas como produção do período.",
      "Itens persistidos podem ser rascunho de orçamento ou registro após baixa. A tabela isolada não comprova consumo de estoque nem execução do serviço. Eventos sem timestamp comprovado não recebem data nem entram em SLA.",
      "Timeline é descartada quando a loja do payload não corresponde ao registro ou quando há ID divergente. Eventos de tipo desconhecido são identificados sem expor texto livre.",
      "A visão de OS contém status e tempos normalizados. Este detalhe não expõe payload bruto, laudos, contatos, observações ou valores financeiros."])
}

async function conversationOrigin(db:ReportDb,storeId:string,q:ReportQuery):Promise<Report> {
  const cte=Prisma.sql`WITH records AS (
    SELECT m.id,m.direction,${utcText(Prisma.sql`m."createdAt"`)} AS date,
      CASE WHEN m."externalMessageId" LIKE 'wamid.%' THEN 'ID wamid declarado; aceite externo não verificado' ELSE 'Registro local, fora dos indicadores wamid' END AS evidence
    FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id=m."conversationId" AND c."storeId"=${storeId}
    WHERE m."storeId"=${storeId} AND c.id=${q.source} AND m."createdAt">=${q.start} AND m."createdAt"<${q.end}
  )`
  const [rows,count]=await Promise.all([
    db.$queryRaw<Row[]>(Prisma.sql`${cte} SELECT * FROM records ORDER BY date,id ${paginate(q)}`),
    db.$queryRaw<{total:number}[]>(Prisma.sql`${cte} SELECT count(*)::int AS total FROM records`),
  ])
  return detail("whatsapp","Registros da conversa sem conteúdo pessoal","WhatsAppMessage.id + WhatsAppConversation.id na mesma loja.",
    [{key:"id",label:"ID do registro"},{key:"date",label:"Data persistida",format:"date"},{key:"direction",label:"Direção gravada"},{key:"evidence",label:"Cobertura da origem"}],rows,count[0].total,
    ["São linhas físicas, inclusive duplicatas e registros locais. O relatório agregado deduplica ID/direção. Nenhuma linha comprova entrega ou execução externa.",
      "Não são retornados corpo, telefone, contato, externalMessageId bruto, payload ou token. Nenhuma mensagem é enviada."])
}

export async function originReport(db:ReportDb,kind:ReportKind,storeId:string,q:ReportQuery):Promise<Report> {
  if((kind==="produtos"||kind==="clientes")&&q.source.startsWith("venda:"))return saleOrigin(db,kind,storeId,q)
  if(kind==="fluxo-caixa"||kind==="dre")return financialOrigin(db,kind,storeId,q)
  if(kind==="os")return orderOrigin(db,storeId,q)
  if(kind==="whatsapp")return conversationOrigin(db,storeId,q)
  return detail(kind,"Origem não encontrada","Identificador sem origem compatível com este relatório.",[],[],0)
}
