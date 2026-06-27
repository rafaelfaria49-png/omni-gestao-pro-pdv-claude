/**
 * Operações V4 Preview — dados mockados (visual, sem backend).
 *
 * Espelha fielmente os dados embutidos no `data-dc-script` do protótipo
 * `design/operacoes-v4/Operacoes-V4-Standalone.html`. Tudo estático e local —
 * nenhuma leitura de Prisma/Server Action/V3.
 */
import { C } from "./tokens";
import type { V4Status, V4Stage, V4Tone } from "./types";

/** Ordem linear do fluxo (governa concluído/atual/pendente). */
export const ORDER: V4Status[] = [
  "aberta",
  "diagnostico",
  "aguardando_aprovacao",
  "aprovado",
  "em_execucao",
  "pronta",
  "entregue",
];

export const STATUS_LABEL: Record<V4Status, string> = {
  aberta: "Aberta",
  diagnostico: "Diagnóstico",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovada",
  aguardando_peca: "Aguardando peça",
  em_execucao: "Em execução",
  pronta: "Pronta",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

export const TONE: Record<V4Status, V4Tone> = {
  aberta: { bg: C.infoBg, fg: C.infoFg, dot: C.info },
  diagnostico: { bg: C.infoBg, fg: C.infoFg, dot: C.info },
  aguardando_aprovacao: { bg: C.warnBg, fg: C.warnFg, dot: C.warn },
  aprovado: { bg: C.primaryBg, fg: C.primaryHover, dot: C.primary },
  aguardando_peca: { bg: C.warnBg, fg: C.warnFg, dot: C.warn },
  em_execucao: { bg: C.primaryBg, fg: C.primaryHover, dot: C.primary },
  pronta: { bg: C.successBg, fg: C.successFg, dot: C.success },
  entregue: { bg: C.line3, fg: C.bodySoft, dot: C.subtle },
  cancelada: { bg: C.dangerBg, fg: C.dangerFg, dot: C.danger },
};

export const PRIO = {
  baixa: { label: "Baixa", fg: C.successFg, dot: C.success },
  normal: { label: "Normal", fg: C.infoFg, dot: C.info },
  alta: { label: "Alta", fg: C.warnFg, dot: C.warn },
  urgente: { label: "Urgente", fg: C.dangerFg, dot: C.danger },
} as const;

/** Ação primária por status (label + transição + etapa de destino). */
export const PRIMARY: Record<
  V4Status,
  { label: string; to: V4Status; stage: V4Stage } | null
> = {
  aberta: { label: "Iniciar diagnóstico", to: "diagnostico", stage: "diagnostico" },
  diagnostico: { label: "Enviar orçamento", to: "aguardando_aprovacao", stage: "orcamento" },
  aguardando_aprovacao: { label: "Registrar aprovação", to: "aprovado", stage: "orcamento" },
  aprovado: { label: "Iniciar serviço", to: "em_execucao", stage: "execucao" },
  aguardando_peca: { label: "Marcar peça chegou", to: "em_execucao", stage: "execucao" },
  em_execucao: { label: "Marcar pronta", to: "pronta", stage: "financeiro" },
  pronta: { label: "Receber pagamento", to: "entregue", stage: "entrega" },
  entregue: null,
  cancelada: null,
};

/* ---- definições de etapas / módulos ---- */

export const RAIL_DEF: Array<[string, string]> = [
  ["dashboard", "Visão geral"],
  ["fila", "Fila"],
  ["workspace", "OS"],
  ["bancada", "Bancada"],
  ["sla", "SLA"],
  ["pdv", "PDV"],
];

export const MODE_DEF: Array<["recepcao" | "bancada" | "auditoria", string, string, string]> = [
  ["recepcao", "Recepção", "🛎", "Cliente + Atividade abertos"],
  ["bancada", "Bancada", "🔧", "Laterais recolhidas · workspace máximo"],
  ["auditoria", "Auditoria", "🔍", "Cliente recolhido · Atividade aberta"],
];

/** Definição das etapas da pipeline: [id, label, statusRepresentado]. */
export const STAGE_DEF: Array<[V4Stage, string, V4Status]> = [
  ["entrada", "Entrada", "aberta"],
  ["diagnostico", "Diagnóstico", "diagnostico"],
  ["orcamento", "Orçamento", "aprovado"],
  ["execucao", "Execução", "em_execucao"],
  ["financeiro", "Financeiro", "pronta"],
  ["entrega", "Entrega", "entregue"],
  ["posvenda", "Pós-venda", "entregue"],
];

export const STEPS_DEF: Array<[string, V4Status]> = [
  ["Abertura", "aberta"],
  ["Diagnóstico", "diagnostico"],
  ["Orçamento", "aguardando_aprovacao"],
  ["Aprovação", "aprovado"],
  ["Execução", "em_execucao"],
  ["Pronta", "pronta"],
  ["Entrega", "entregue"],
];

export const HIST_FILTER_DEF: Array<[string, string]> = [
  ["todos", "Tudo"],
  ["status", "Status"],
  ["financeiro", "Financeiro"],
  ["comunicacao", "Comunicação"],
  ["tecnico", "Técnico"],
];

export const RET_HIST = [
  { dot: C.success, text: "Garantia anterior — bateria", meta: "Encerrada · 08/2025 · sem retorno" },
];

/* ---- dados dos módulos (rail) ---- */

export const MODULE_META: Record<string, { icon: string; title: string; subtitle: string }> = {
  dashboard: { icon: "📊", title: "Visão geral", subtitle: "Unidade Centro · hoje 20/06" },
  fila: { icon: "📋", title: "Fila de OS", subtitle: "18 ordens ativas" },
  bancada: { icon: "🔧", title: "Bancada por técnico", subtitle: "3 técnicos · 7 em execução" },
  sla: { icon: "⏱", title: "SLA & atrasos", subtitle: "3 prazos em risco" },
  pdv: { icon: "💳", title: "PDV de serviço", subtitle: "Caixa aberto · Rafael" },
};

export const MODULE_KPIS: Record<string, Array<{ label: string; value: string; sub: string; color: string }>> = {
  dashboard: [
    { label: "OS abertas", value: "18", sub: "+3 hoje", color: C.infoFg },
    { label: "Em execução", value: "7", sub: "2 bancadas", color: C.primaryHover },
    { label: "Prontas p/ entrega", value: "4", sub: "aguardam cliente", color: C.successFg },
    { label: "SLA em risco", value: "3", sub: "< 4h restantes", color: C.warnFg },
  ],
  fila: [
    { label: "Aberta", value: "5", sub: "novas", color: C.infoFg },
    { label: "Em execução", value: "7", sub: "bancada", color: C.primaryHover },
    { label: "Aguardando", value: "2", sub: "aprovação/peça", color: C.warnFg },
    { label: "Prontas", value: "4", sub: "p/ entrega", color: C.successFg },
  ],
  bancada: [
    { label: "Técnicos ativos", value: "3", sub: "no turno", color: C.infoFg },
    { label: "OS em execução", value: "7", sub: "distribuídas", color: C.primaryHover },
    { label: "Carga média", value: "72%", sub: "capacidade", color: C.warnFg },
    { label: "No prazo", value: "5", sub: "de 7", color: C.successFg },
  ],
  sla: [
    { label: "No prazo", value: "13", sub: "saudáveis", color: C.successFg },
    { label: "Em risco", value: "3", sub: "< 4h", color: C.warnFg },
    { label: "Estourados", value: "2", sub: "ação imediata", color: C.dangerFg },
    { label: "Média atraso", value: "1.4h", sub: "estourados", color: C.muted },
  ],
  pdv: [
    { label: "Recebido hoje", value: "R$ 1.840", sub: "serviços", color: C.successFg },
    { label: "A receber", value: "R$ 3.270", sub: "8 OS", color: C.warnFg },
    { label: "Saldo em caixa", value: "R$ 2.040", sub: "desde 08:02", color: C.ink },
    { label: "Recebimentos", value: "12", sub: "no dia", color: C.primaryHover },
  ],
};

export const FILA_COLS = [
  {
    title: "Aberta",
    count: 5,
    items: [
      { codigo: "OS-0488", cliente: "João P.", aparelho: "Galaxy S22", dot: C.info, sla: "no prazo · 2d", slaColor: C.successFg },
      { codigo: "OS-0487", cliente: "Lúcia R.", aparelho: "iPhone 12", dot: C.info, sla: "no prazo · 1d", slaColor: C.successFg },
    ],
  },
  {
    title: "Diagnóstico",
    count: 3,
    items: [{ codigo: "OS-0485", cliente: "Marcos T.", aparelho: "Moto G73", dot: C.info, sla: "risco · 5h", slaColor: C.warnFg }],
  },
  {
    title: "Aprovação",
    count: 2,
    items: [{ codigo: "OS-0479", cliente: "Bianca S.", aparelho: "iPhone 11", dot: C.warn, sla: "aguardando", slaColor: C.warnFg }],
  },
  {
    title: "Execução",
    count: 7,
    items: [
      { codigo: "OS-0481", cliente: "Mariana L.", aparelho: "iPhone 13 Pro", dot: C.primary, sla: "no prazo · 6h", slaColor: C.successFg },
      { codigo: "OS-0480", cliente: "Caio M.", aparelho: "Redmi Note 12", dot: C.primary, sla: "risco · 3h", slaColor: C.warnFg },
    ],
  },
  {
    title: "Pronta",
    count: 4,
    items: [{ codigo: "OS-0476", cliente: "Ana C.", aparelho: "iPhone XR", dot: C.success, sla: "entregar", slaColor: C.successFg }],
  },
];

export const BANCADA_TEC = [
  {
    ini: "BA", nome: "Bruno Alves", os: 3, carga: "alta", avBg: C.primaryBg, avFg: C.primaryHover,
    status: "No prazo", statusColor: C.successFg, pct: "78%", barColor: C.primary,
    lista: [
      { codigo: "OS-0481", desc: "Troca de tela · iPhone 13 Pro", dot: C.primary, sla: "6h", slaColor: C.successFg },
      { codigo: "OS-0480", desc: "Conector de carga", dot: C.warn, sla: "3h", slaColor: C.warnFg },
    ],
  },
  {
    ini: "CM", nome: "Carla Menezes", os: 2, carga: "média", avBg: C.successBg, avFg: C.successFg,
    status: "No prazo", statusColor: C.successFg, pct: "52%", barColor: C.success,
    lista: [{ codigo: "OS-0478", desc: "Bateria · Galaxy A54", dot: C.success, sla: "1d", slaColor: C.successFg }],
  },
  {
    ini: "RP", nome: "Rafael Pinto", os: 2, carga: "média", avBg: C.warnBg, avFg: C.warnFg,
    status: "1 em risco", statusColor: C.warnFg, pct: "64%", barColor: C.warn,
    lista: [{ codigo: "OS-0473", desc: "Placa · Moto G73", dot: C.danger, sla: "estourado", slaColor: C.dangerFg }],
  },
];

export const SLA_ROWS = [
  { codigo: "OS-0473", cliente: "Pedro Lima", aparelho: "Moto G73", etapa: "Execução", restante: "-1h20", restColor: C.dangerFg, tag: "Estourado", tagBg: C.dangerBg, tagFg: C.dangerFg, bg: C.surface },
  { codigo: "OS-0469", cliente: "Sofia Dias", aparelho: "iPhone 12", etapa: "Aprovação", restante: "-0h40", restColor: C.dangerFg, tag: "Estourado", tagBg: C.dangerBg, tagFg: C.dangerFg, bg: C.surface2 },
  { codigo: "OS-0480", cliente: "Caio Moraes", aparelho: "Redmi Note 12", etapa: "Execução", restante: "3h", restColor: C.warnFg, tag: "Em risco", tagBg: C.warnBg, tagFg: C.warnFg, bg: C.surface },
  { codigo: "OS-0485", cliente: "Marcos Teles", aparelho: "Moto G73", etapa: "Diagnóstico", restante: "5h", restColor: C.warnFg, tag: "Em risco", tagBg: C.warnBg, tagFg: C.warnFg, bg: C.surface2 },
  { codigo: "OS-0481", cliente: "Mariana Lima", aparelho: "iPhone 13 Pro", etapa: "Execução", restante: "6h", restColor: C.successFg, tag: "No prazo", tagBg: C.successBg, tagFg: C.successFg, bg: C.surface },
  { codigo: "OS-0478", cliente: "Tiago Reis", aparelho: "Galaxy A54", etapa: "Execução", restante: "1d", restColor: C.successFg, tag: "No prazo", tagBg: C.successBg, tagFg: C.successFg, bg: C.surface2 },
];

export const PDV_RECEBER = [
  { codigo: "OS-2026-0481", cliente: "Mariana Costa Lima", forma: "Cartão", saldo: "R$ 590,00" },
  { codigo: "OS-2026-0476", cliente: "Ana Carolina", forma: "PIX", saldo: "R$ 320,00" },
  { codigo: "OS-2026-0471", cliente: "Diego Faria", forma: "Dinheiro", saldo: "R$ 180,00" },
  { codigo: "OS-2026-0468", cliente: "Helena M.", forma: "Cartão", saldo: "R$ 740,00" },
];

export const DASH_DIST = [
  { label: "Entrada", n: 5, pct: "42%", color: C.info },
  { label: "Diagnóstico", n: 3, pct: "25%", color: C.info },
  { label: "Orçamento", n: 2, pct: "17%", color: C.warn },
  { label: "Execução", n: 7, pct: "58%", color: C.primary },
  { label: "Pronta", n: 4, pct: "33%", color: C.success },
  { label: "Pós-venda", n: 6, pct: "50%", color: C.subtle },
];

export const DASH_FILA = [
  { codigo: "OS-2026-0481", cliente: "Mariana L.", aparelho: "iPhone 13 Pro", etapa: "Execução", tagBg: C.primaryBg, tagFg: C.primaryHover, sla: "6h", slaColor: C.successFg },
  { codigo: "OS-2026-0480", cliente: "Caio M.", aparelho: "Redmi Note 12", etapa: "Execução", tagBg: C.primaryBg, tagFg: C.primaryHover, sla: "3h", slaColor: C.warnFg },
  { codigo: "OS-2026-0479", cliente: "Bianca S.", aparelho: "iPhone 11", etapa: "Aprovação", tagBg: C.warnBg, tagFg: C.warnFg, sla: "—", slaColor: C.subtle },
  { codigo: "OS-2026-0476", cliente: "Ana C.", aparelho: "iPhone XR", etapa: "Pronta", tagBg: C.successBg, tagFg: C.successFg, sla: "entregar", slaColor: C.successFg },
  { codigo: "OS-2026-0473", cliente: "Pedro L.", aparelho: "Moto G73", etapa: "Execução", tagBg: C.primaryBg, tagFg: C.primaryHover, sla: "atraso", slaColor: C.dangerFg },
];

/* ---- auditoria ---- */

export const RESOLVED_RAW: Array<[string, string]> = [
  ["Rolagem horizontal", "Raiz agora 100% fluida (100vw/100vh); grids em fr; só o palco rola. Cabe em FHD, notebook e ultrawide."],
  ["Recolhíveis reais", "Cliente e Atividade recolhem para trilhos de 32px; o workspace central expande sozinho."],
  ["3 modos de uso", "Recepção, Bancada e Auditoria no topo — ajustam as duas laterais de uma vez e refletem o estado atual."],
  ["Aba Financeiro", "Total/recebido/saldo, forma de pagamento, plano, recebimentos, histórico financeiro e CTA Receber no PDV + aviso de baixa no PDV."],
  ["Aba Entrega", "Retirado por, documento, data/hora, assinatura, checklist final, acessórios devolvidos, garantia e imprimir termo + estado “precisa estar Pronta”."],
  ["Aba Pós-venda", "Situação da garantia, retornos, NPS/satisfação, follow-up WhatsApp, agendar contato e histórico de retornos."],
  ["Espaços vazios", "Execução, Histórico, Financeiro e Entrega agora usam colunas densas — sem cards enormes vazios."],
  ["Rail de ícones", "Visão geral, Fila, OS, Bancada, SLA e PDV viraram telas reais navegáveis com KPIs e listas."],
  ["Header e etapas", "Topo 44→40px, comando 54→46px, spine 66→52px — mais conteúdo útil por tela."],
  ["Nova OS completa (v4)", "Modal com buscar/cadastrar cliente, equipamento, marca/modelo/IMEI/cor, defeito, observações, origem e recebido por."],
  ["Segurança / acesso (v4)", "PIN, senha, padrão de 9 pontos interativo, Face/biometria, Google, iCloud, observação e aviso de máscara na impressão."],
  ["Orçamento por tipo (v4)", "Cada item alterna Cobrado / Brinde / Desconto; subtotal, desconto, brindes, total, custo e lucro recalculam ao vivo."],
  ["Recibo + saldo devedor (v4)", "Financeiro gera recibo de pagamento e mostra saldo devedor após pagamento parcial."],
  ["Auditoria filtrável (v4)", "Filtros de Status / Financeiro / Comunicação / Técnico agora filtram a linha do tempo de verdade."],
  ["Identidade visual", "Mesma paleta (índigo #4f46e5 + neutros) e tipografia; nenhum tema novo."],
];

export const PENDING = [
  { title: "Ações de escrita reais", text: "Inputs de Entrega/Pós-venda são visuais; persistência (entregar, abrir retorno, assinar) virá pela ligação com os hooks da V3." },
  { title: "Catálogo / ProductPicker", text: "Os botões + Serviço / + Peça abrem o catálogo real do estoque na integração final." },
  { title: "Módulos completos", text: "Dashboard, Fila, Bancada, SLA e PDV são protótipos de alta fidelidade — falta conectar aos dados ao vivo." },
  { title: "Responsivo < 1280px", text: "Abaixo de notebook padrão as colunas devem colapsar para 2/1 — regras de breakpoint na próxima fase." },
];

/* ---- Nova OS / segurança ---- */

export const EQUIP_DEF: Array<[string, string]> = [
  ["celular", "Celular"],
  ["tablet", "Tablet"],
  ["notebook", "Notebook"],
  ["videogame", "Videogame"],
  ["outro", "Outro"],
];

export const ORIGEM_DEF: Array<[string, string]> = [
  ["balcao", "Balcão"],
  ["whatsapp", "WhatsApp"],
  ["retorno", "Retorno"],
  ["garantia", "Garantia"],
];

export const CLIENTES_BUSCA = [
  { nome: "Mariana Costa Lima", doc: "328.114.905-77", tel: "(11) 98842-1190", os: 3, ini: "MC" },
  { nome: "Carlos Eduardo Souza", doc: "455.902.118-30", tel: "(11) 99731-4420", os: 1, ini: "CE" },
  { nome: "Beatriz Almeida", doc: "201.556.770-12", tel: "(11) 98120-7755", os: 5, ini: "BA" },
];
