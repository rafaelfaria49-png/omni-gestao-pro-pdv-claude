import "server-only"
import { Prisma } from "@/generated/prisma"
import { bucket, like, paginate, utcText, type ReportDb } from "./sql"
import type { Report, ReportQuery } from "./contracts"

export async function whatsappReport(db: ReportDb, storeId: string, q: ReportQuery): Promise<Report> {
  const cte=Prisma.sql`WITH verified AS (
      SELECT DISTINCT ON (m.direction,m."externalMessageId") m.id,m."conversationId",m.direction,m."createdAt"
      FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id=m."conversationId" AND c."storeId"=${storeId}
      WHERE m."storeId"=${storeId} AND m."externalMessageId" LIKE 'wamid.%' AND m.direction IN ('inbound','outbound') AND m."createdAt"<${q.end}
      ORDER BY m.direction,m."externalMessageId",m."createdAt",m.id
    ), first_in AS (
      SELECT "conversationId",min("createdAt") AS first_in FROM verified WHERE direction='inbound' GROUP BY "conversationId"
    ), conversations AS (
      SELECT c.id,c.status,f.first_in,min(m."createdAt") AS first_out
      FROM first_in f JOIN whatsapp_conversations c ON c.id=f."conversationId" AND c."storeId"=${storeId}
      LEFT JOIN verified m ON m."conversationId"=c.id AND m.direction='outbound' AND m."createdAt">=f.first_in
      WHERE f.first_in>=${q.start} GROUP BY c.id,f.first_in
    ), filtered AS (SELECT * FROM conversations WHERE (${q.entity}='' OR id=${q.entity}) AND id ILIKE ${like(q.search)} AND (${q.status}='' OR status=${q.status}))`
  const [summary,counts,rows,trend,logs]=await Promise.all([
    db.$queryRaw<{started:number;answered:number;pending:number;hours:number|null;total:number}[]>(Prisma.sql`${cte}
      SELECT count(*)::int AS started,count(first_out)::int AS answered,count(*) FILTER(WHERE first_out IS NULL)::int AS pending,
        avg(extract(epoch from first_out-first_in)/3600)::float8 AS hours,(SELECT count(*)::int FROM filtered) AS total FROM conversations`),
    db.$queryRaw<{incoming:number;outgoing:number;local:number}[]>(Prisma.sql`${cte} SELECT
      count(*) FILTER(WHERE direction='inbound' AND "createdAt">=${q.start})::int AS incoming,count(*) FILTER(WHERE direction='outbound' AND "createdAt">=${q.start})::int AS outgoing,
      (SELECT count(*)::int FROM whatsapp_messages WHERE "storeId"=${storeId} AND "createdAt">=${q.start} AND "createdAt"<${q.end} AND "externalMessageId" NOT LIKE 'wamid.%') AS local FROM verified`),
    db.$queryRaw<Record<string,string|number|null>[]>(Prisma.sql`${cte}
      SELECT id,status,${utcText(Prisma.sql`first_in`)} AS first,${utcText(Prisma.sql`first_out`)} AS response,(extract(epoch from first_out-first_in)/3600)::float8 AS hours,
        CASE WHEN first_out IS NULL THEN 'Sem registro de resposta com wamid' ELSE 'Resposta registrada com wamid; aceite não verificado' END AS evidence FROM filtered ORDER BY first_in DESC,id ${paginate(q)}`),
    db.$queryRaw<{label:string;value:number;secondary:number}[]>(Prisma.sql`${cte} SELECT ${bucket(Prisma.sql`"createdAt"`,q)} AS label,
      count(*) FILTER(WHERE direction='inbound')::float8 AS value,count(*) FILTER(WHERE direction='outbound')::float8 AS secondary FROM verified WHERE "createdAt">=${q.start} GROUP BY 1 ORDER BY 1`),
    db.$queryRaw<{blocked:number;simulations:number}[]>(Prisma.sql`SELECT count(*) FILTER(WHERE action='whatsapp_send_no_store_credentials')::int AS blocked,
      count(*) FILTER(WHERE action LIKE 'automation_simulation%')::int AS simulations FROM whatsapp_automation_logs WHERE "storeId"=${storeId} AND "createdAt">=${q.start} AND "createdAt"<${q.end}`),
  ])
  const t=summary[0],m=counts[0],l=logs[0]
  return {
    kind:"whatsapp",title:"WhatsApp HUB",basis:"Registros com identificador wamid persistido; coorte pelo primeiro registro inbound. Aceite externo não é verificado por este contrato.",
    source:"WhatsAppMessage + WhatsAppConversation e logs de automação da loja. Nenhuma chamada à Meta ou envio.",
    limitations:["O contrato permite gravação local de IDs wamid. A presença do ID não comprova aceite/entrega pelo provedor. Os números representam registros persistidos com esse identificador, sem verificação externa; duplicatas de ID/direção são contadas uma vez.",
      "Intervalo de resposta mede primeiro registro outbound após o primeiro inbound da coorte; não comprova atendimento humano ou envio físico. Pode incluir automação. Conversas anteriores com registros no recorte entram apenas no volume de mensagens.",
      "Status é o estado atual. Conclusões/abandono por período, falhas de entrega e execução real de automações permanecem indisponíveis por falta de eventos históricos completos.",
      `Registros sem identificador wamid excluídos do recorte: ${m.local}. Logs de simulação excluídos de execuções reais: ${l.simulations}. Bloqueios de envio registrados no log de automações: ${l.blocked}; não equivalem a falhas de entrega.`,
      "Sem nomes, telefones, corpos de mensagens ou tokens na resposta/exportação. Canais sem ID wamid ficam fora deste recorte de registros."],
    metrics:[{key:"started",label:"Conversas com primeiro inbound registrado",value:t.started,format:"number"},{key:"answered",label:"Conversas com resposta registrada",value:t.answered,format:"number"},
      {key:"incoming",label:"Registros inbound com ID wamid",value:m.incoming,format:"number"},{key:"outgoing",label:"Registros outbound com ID wamid",value:m.outgoing,format:"number"},
      {key:"hours",label:"Intervalo médio entre registros de primeira resposta",value:t.hours,format:"hours",reason:"Sem pares de registros com ID wamid no período."},{key:"pending",label:"Conversas da coorte sem registro de resposta",value:t.pending,format:"number"},
      {key:"accepted",label:"Envios com aceite externo comprovado",value:null,reason:"O schema não distingue ID externo fornecido localmente de aceite autenticado do provedor."},
      {key:"closed",label:"Atendimentos concluídos no período",value:null,reason:"Sem evento histórico de encerramento com timestamp."},
      {key:"automations",label:"Automações efetivamente executadas",value:null,reason:"Logs atuais incluem simulações e não comprovam execução integral."},
      {key:"failures",label:"Falhas de entrega",value:null,reason:"Sem telemetria de status de entrega completa e persistida."}],
    columns:[{key:"id",label:"Conversa"},{key:"status",label:"Status atual"},{key:"first",label:"Primeiro inbound",format:"date"},
      {key:"response",label:"Primeira resposta",format:"date"},{key:"hours",label:"Tempo de resposta",format:"hours"},{key:"evidence",label:"Evidência"}],
    rows:rows.map(r=>({...r,href:`/dashboard/relatorios/whatsapp?source=${encodeURIComponent(String(r.id))}&from=${q.from}&to=${q.to}`})),total:t.total,trend,
  }
}
