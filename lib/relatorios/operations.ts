import "server-only"
import { Prisma } from "@/generated/prisma"
import { bucket, instant, like, paginate, utcText, type ReportDb } from "./sql"
import type { Report, ReportQuery } from "./contracts"

function operations(storeId: string, q: ReportQuery) {
  const rawEntry=instant(Prisma.sql`p#>>'{aberturaV3,recepcao,dataEntrada}'`)
  const entry = Prisma.sql`CASE WHEN p#>>'{comercialV4,tipo}'='orcamento_pre_os' AND NOT coalesce(
    p#>>'{aberturaV3,recepcao,dataEntradaMeta,precisao}' IN ('dia','data_hora') AND
    p#>>'{aberturaV3,recepcao,dataEntradaMeta,dia}'=to_char((${rawEntry}) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AND
    (p#>>'{aberturaV3,recepcao,dataEntradaMeta,precisao}'='data_hora' OR to_char((${rawEntry}) AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS.US')='12:00:00.000000'),false) THEN NULL
    ELSE ${rawEntry} END`
  const delivered = instant(Prisma.sql`coalesce(nullif(p#>>'{entregaV3,entregueEm}',''),nullif(p->>'entregueEm',''),p#>>'{retirada,retiradoEm}')`)
  const promised = instant(Prisma.sql`p#>>'{aberturaV3,recepcao,previsaoEntrega}'`)
  return Prisma.sql`WITH base AS (
      SELECT id,numero,status,"createdAt",CASE WHEN payload->>'storeId'=${storeId} THEN payload ELSE NULL END AS p
      FROM ordens_servico WHERE "storeId"=${storeId} AND "createdAt">=${q.start} AND "createdAt"<${q.end}
    ), normalized AS (
      SELECT *, CASE WHEN p->>'operacaoStatusV3' IN ('aberta','diagnostico','aguardando_aprovacao','aprovado','em_execucao','aguardando_peca','pronta','recebida','entregue','cancelada') THEN p->>'operacaoStatusV3'
        WHEN p->>'operacaoStatus' IN ('aberta','diagnostico','aguardando_aprovacao','aprovado','em_execucao','aguardando_peca','pronta','entregue','cancelada') THEN p->>'operacaoStatus'
        WHEN p->>'status' IN ('aberta','diagnostico','aguardando_aprovacao','aprovado','em_execucao','aguardando_peca','pronta','entregue','cancelada') THEN p->>'status'
        WHEN status='Entregue' THEN 'entregue' WHEN status='Pronto' THEN 'pronta' WHEN status='EmAnalise' THEN 'diagnostico' ELSE 'aberta' END AS state,
        p#>>'{tecnico,id}' AS technician_id, ${entry} AS entered, ${delivered} AS delivered, ${promised} AS promised,
        p#>>'{aberturaV3,recepcao,dataEntradaMeta,precisao}' AS entry_precision,
        coalesce(p#>>'{entregaV3,entregueEmMeta,precisao}',p#>>'{atendimentoRapidoV3,concluidoEmMeta,precisao}') AS delivery_precision,
        p#>>'{aberturaV3,recepcao,previsaoEntregaMeta,precisao}' AS promise_precision
      FROM base
    ), classified AS (
      SELECT n.*,t.id AS resolved_technician_id,coalesce(t.name,'Sem técnico com vínculo comprovado') AS technician,
        CASE WHEN state='entregue' AND entered IS NOT NULL AND delivered>=entered AND delivered<=${q.end}
          AND coalesce(entry_precision,'data_hora')='data_hora' AND coalesce(delivery_precision,'data_hora')='data_hora'
          THEN extract(epoch from delivered-entered)/3600 END::float8 AS hours,
        CASE WHEN promised IS NOT NULL AND delivered IS NOT NULL AND state='entregue' THEN
          CASE WHEN promise_precision='dia' THEN (delivered AT TIME ZONE 'America/Sao_Paulo')::date<=(promised AT TIME ZONE 'America/Sao_Paulo')::date
            WHEN coalesce(delivery_precision,'data_hora')='data_hora' THEN delivered<=promised END END AS ontime,
        CASE WHEN state NOT IN ('entregue','cancelada') AND promised IS NOT NULL THEN
          CASE WHEN promise_precision='dia' THEN (promised AT TIME ZONE 'America/Sao_Paulo')::date<(${q.end}::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date
            ELSE promised<${q.end} END ELSE false END AS late,
        EXISTS(SELECT 1 FROM garantia_ordem_servico g WHERE g."storeId"=${storeId} AND g."ordemServicoId"=n.id AND g.status<>'cancelada') AS warranty,
        EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p->'timeline')='array' THEN p->'timeline' ELSE '[]'::jsonb END) e WHERE e->>'tipo'='garantia_acionada') AS returned
      FROM normalized n LEFT JOIN tecnicos t ON t.id=n.technician_id AND t."storeId"=${storeId}
    ), filtered AS (
      SELECT * FROM classified WHERE (${q.entity}='' OR id=${q.entity}) AND (${q.status}='' OR state=${q.status}) AND (${q.technician}='' OR coalesce(resolved_technician_id,'__unassigned__')=${q.technician})
        AND (coalesce(numero,id) ILIKE ${like(q.search)} OR technician ILIKE ${like(q.search)})
    ), linked_cash AS (
      SELECT c.payload->>'ordemServicoId' AS os_id,sum(CASE m.tipo WHEN 'entrada' THEN m.valor ELSE -m.valor END)::float8 AS received
      FROM movimentacoes_financeiras m JOIN contas_receber_titulos c ON c.id=m."referenciaId" AND c."storeId"=${storeId}
      WHERE m."storeId"=${storeId} AND m."createdAt">=${q.start} AND m."createdAt"<${q.end}
        AND lower(m.origem) ~ '^(receber|estorno_receber)' GROUP BY c.payload->>'ordemServicoId'
    )`
}

export async function operationsReport(db: ReportDb, storeId: string, q: ReportQuery, technicians = false): Promise<Report> {
  const cte=operations(storeId,q)
  const [stats,rows,total,trend,services] = await Promise.all([
    db.$queryRaw<{ orders:number; open:number; completed:number; cancelled:number; pending:number; late:number; hours:number|null; measured:number; promises:number; ontime:number; warranty:number; returned:number; cash:number }[]>(Prisma.sql`${cte}
      SELECT count(*)::int AS orders,count(*) FILTER(WHERE state='aberta')::int AS open,count(*) FILTER(WHERE state IN ('pronta','recebida','entregue'))::int AS completed,
        count(*) FILTER(WHERE state='cancelada')::int AS cancelled,count(*) FILTER(WHERE state NOT IN ('pronta','recebida','entregue','cancelada'))::int AS pending,
        count(*) FILTER(WHERE late)::int AS late,avg(hours)::float8 AS hours,count(hours)::int AS measured,count(ontime)::int AS promises,
        count(*) FILTER(WHERE ontime)::int AS ontime,count(*) FILTER(WHERE warranty)::int AS warranty,count(*) FILTER(WHERE returned)::int AS returned,
        coalesce(sum(l.received),0)::float8 AS cash FROM filtered f LEFT JOIN linked_cash l ON l.os_id=f.id`),
    technicians
      ? db.$queryRaw<Record<string,string|number|null>[]>(Prisma.sql`${cte}
          SELECT coalesce(resolved_technician_id,'__unassigned__') AS id,technician AS name,count(*)::int AS assigned,
            count(*) FILTER(WHERE state IN ('pronta','recebida','entregue'))::int AS completed,avg(hours)::float8 AS hours,count(hours)::int AS sample,
            CASE WHEN count(ontime)>=5 THEN 100.0*count(*) FILTER(WHERE ontime)/count(ontime) ELSE NULL END::float8 AS sla,
            count(*) FILTER(WHERE returned)::int AS returns,count(*) FILTER(WHERE warranty)::int AS warranties,coalesce(sum(l.received),0)::float8 AS cash
          FROM filtered f LEFT JOIN linked_cash l ON l.os_id=f.id GROUP BY resolved_technician_id,technician ORDER BY technician,resolved_technician_id ${paginate(q)}`)
      : db.$queryRaw<Record<string,string|number|null>[]>(Prisma.sql`${cte}
          SELECT f.id,coalesce(numero,f.id) AS number,state AS status,technician,${utcText(Prisma.sql`"createdAt"`)} AS created,
            CASE WHEN entry_precision='dia' THEN to_char(entered AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') ELSE ${utcText(Prisma.sql`entered AT TIME ZONE 'UTC'`)} END AS entered,
            CASE WHEN delivery_precision='dia' THEN to_char(delivered AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') ELSE ${utcText(Prisma.sql`delivered AT TIME ZONE 'UTC'`)} END AS delivered,
            CASE WHEN promise_precision='dia' THEN to_char(promised AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') ELSE ${utcText(Prisma.sql`promised AT TIME ZONE 'UTC'`)} END AS promised,hours,
            CASE WHEN ontime THEN 'No prazo' WHEN ontime=false THEN 'Fora do prazo' WHEN late THEN 'Em atraso' ELSE 'Sem evidência de prazo' END AS sla,
            CASE WHEN warranty THEN 'Registrada' ELSE 'Sem registro' END AS warranty,coalesce(l.received,0)::float8 AS cash
          FROM filtered f LEFT JOIN linked_cash l ON l.os_id=f.id ORDER BY "createdAt" DESC,f.id ${paginate(q)}`),
    db.$queryRaw<{ total:number }[]>(Prisma.sql`${cte} SELECT ${technicians?Prisma.sql`count(DISTINCT coalesce(resolved_technician_id,'__unassigned__'))`:Prisma.sql`count(*)`}::int AS total FROM filtered`),
    db.$queryRaw<{label:string;value:number}[]>(Prisma.sql`${cte} SELECT ${bucket(Prisma.sql`"createdAt"`,q)} AS label,count(*)::float8 AS value FROM filtered GROUP BY 1 ORDER BY 1`),
    db.$queryRaw<{name:string;quantity:number}[]>(Prisma.sql`${cte} SELECT i.descricao AS name,sum(i.quantidade)::int AS quantity FROM ordem_servico_item i JOIN filtered f ON f.id=i."ordemServicoId"
      WHERE i.tipo='servico' AND f.state IN ('pronta','recebida','entregue') GROUP BY i.descricao ORDER BY 2 DESC,1 LIMIT 10`),
  ])
  const t=stats[0]
  return {
    kind:technicians?"tecnicos":"os",title:technicians?"Desempenho de técnicos":"Ordens de serviço",
    basis:"Coorte pela criação do registro; status atual. V3 e V4 consultam a mesma OS, contada uma vez por ID.",
    source:"OrdemServico + payload canônico + Técnico da mesma loja + GarantiaOrdemServico + títulos/ledger com ordemServicoId comprovado.",
    limitations:["Concluída = pronta, recebida ou entregue; pendente = demais estados não concluídos/cancelados. O status V3 é autoritativo antes dos espelhos V2/Prisma. Tempo de atendimento mede entrada até entrega, somente com instantes válidos e precisão de hora; updatedAt não é conclusão.",
      `Cobertura de tempo: ${t.measured}/${t.orders} registros. Cobertura de prazo realizado: ${t.promises}; percentuais individuais exigem pelo menos 5 entregas com prazo. Amostra pequena não gera ranking de desempenho.`,
      "Prazos sem horário são comparados pelo dia em São Paulo. Pré-orçamentos ainda armazenados como OS podem aparecer; seus valores não são faturamento. Orçamentos sem aprovação não são somados.",
      "Recebimento vinculado é caixa do período para OS da coorte; não é faturamento por competência. Atribuição ao técnico é a atual, sem histórico confiável de transferências de responsabilidade.",
      "Retorno = evento garantia_acionada no histórico; garantia = registro persistido não cancelado. Não há inferência por nome, defeito ou cliente. Satisfação, metas e comissões não estão disponíveis.",
      `Serviços concluídos mais registrados (top 10, não orçamento aberto): ${services.length?services.map(s=>`${s.name}: ${s.quantity}`).join('; '):'sem itens de serviço persistidos no recorte'}.`],
    metrics:[{key:"orders",label:"Registros de OS na coorte",value:t.orders,format:"number"},{key:"open",label:"Abertas",value:t.open,format:"number"},
      {key:"completed",label:"Concluídas da coorte (prontas/recebidas/entregues)",value:t.completed,format:"number"},{key:"cancelled",label:"Canceladas",value:t.cancelled,format:"number"},
      {key:"pending",label:"Pendentes atuais da coorte",value:t.pending,format:"number"},{key:"late",label:"Pendentes atuais com prazo anterior ao fim do recorte",value:t.late,format:"number"},
      {key:"hours",label:"Tempo médio de atendimento medido",value:t.hours,format:"hours",reason:"Sem entrada e entrega com precisão de hora."},
      {key:"cash",label:"Recebimentos comprovadamente vinculados",value:t.cash,format:"money"},
      {key:"revenue",label:"Faturamento por competência",value:null,reason:"Não equiparar orçamento ou recebimento a receita por competência."}],
    columns:technicians?[{key:"name",label:"Técnico"},{key:"assigned",label:"Atribuídas",format:"number"},{key:"completed",label:"Concluídas",format:"number"},
      {key:"hours",label:"Tempo médio medido",format:"hours"},{key:"sample",label:"Amostra de tempos",format:"number"},{key:"sla",label:"Entregas no prazo",format:"percent"},
      {key:"returns",label:"OS com acionamento",format:"number"},{key:"warranties",label:"OS com garantia",format:"number"},{key:"cash",label:"Recebimentos vinculados",format:"money"}]
      :[{key:"number",label:"OS"},{key:"status",label:"Status"},{key:"technician",label:"Técnico"},{key:"entered",label:"Entrada efetiva",format:"date"},
        {key:"delivered",label:"Entrega",format:"date"},{key:"promised",label:"Prometida",format:"date"},{key:"hours",label:"Tempo medido",format:"hours"},
        {key:"sla",label:"Prazo"},{key:"warranty",label:"Garantia"},{key:"cash",label:"Recebimentos vinculados",format:"money"}],
    rows:rows.map(r=>({...r,href:technicians?`/dashboard/relatorios/os?technician=${encodeURIComponent(String(r.id))}&from=${q.from}&to=${q.to}`:`/dashboard/relatorios/os?entity=${encodeURIComponent(String(r.id))}&from=${q.from}&to=${q.to}`})),
    total:total[0].total,trend,
  }
}
