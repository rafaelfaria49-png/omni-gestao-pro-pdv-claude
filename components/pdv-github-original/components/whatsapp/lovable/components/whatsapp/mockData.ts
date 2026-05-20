export type ContactStatus = "auto" | "human" | "waiting";
export type FunnelStage =
  | "novo"
  | "atendimento"
  | "aguardando_cliente"
  | "aguardando_orcamento"
  | "finalizado";

export interface Message {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  status: ContactStatus;
  stage: FunnelStage;
  responsible: string;
  idleMinutes: number;
  tags: string[];
  clientSince: string;
  totalSpent: number;
  notes: string;
  messages: Message[];
  os: { id: string; title: string; status: string }[];
  history: { date: string; summary: string }[];
}

export const mockContacts: Contact[] = [
  {
    id: "1",
    name: "João Silva",
    phone: "+55 11 98765-4321",
    lastMessage: "Meu celular está pronto?",
    lastTime: "10:42",
    unread: 2,
    status: "waiting",
    stage: "atendimento",
    responsible: "Você",
    idleMinutes: 14,
    tags: ["VIP", "iPhone"],
    clientSince: "Jan/2024",
    totalSpent: 1280,
    notes: "Cliente recorrente. Prefere retirada à tarde.",
    messages: [
      { id: "m1", from: "them", text: "Olá, bom dia!", time: "10:40" },
      { id: "m2", from: "me", text: "Bom dia João! Em que posso ajudar?", time: "10:41" },
      { id: "m3", from: "them", text: "Meu celular está pronto?", time: "10:42" },
    ],
    os: [{ id: "OS-1042", title: "Troca de tela iPhone 12", status: "Em análise" }],
    history: [
      { date: "12/04/2026", summary: "Solicitou orçamento de bateria" },
      { date: "20/04/2026", summary: "Abertura OS-1042" },
    ],
  },
  {
    id: "2",
    name: "Maria Souza",
    phone: "+55 11 91234-5678",
    lastMessage: "Obrigada!",
    lastTime: "09:15",
    unread: 0,
    status: "auto",
    stage: "finalizado",
    responsible: "Bot",
    idleMinutes: 120,
    tags: ["Notebook"],
    clientSince: "Mar/2025",
    totalSpent: 540,
    notes: "",
    messages: [
      { id: "m1", from: "me", text: "Olá Maria, sua OS-1038 foi finalizada.", time: "09:10" },
      { id: "m2", from: "them", text: "Obrigada!", time: "09:15" },
    ],
    os: [{ id: "OS-1038", title: "Formatação Notebook", status: "Concluída" }],
    history: [{ date: "01/05/2026", summary: "OS-1038 concluída" }],
  },
  {
    id: "3",
    name: "Carlos Mendes",
    phone: "+55 11 99988-7766",
    lastMessage: "Quanto fica o conserto?",
    lastTime: "Ontem",
    unread: 1,
    status: "human",
    stage: "aguardando_orcamento",
    responsible: "Lucas",
    idleMinutes: 35,
    tags: ["Novo"],
    clientSince: "Hoje",
    totalSpent: 0,
    notes: "Primeiro contato.",
    messages: [{ id: "m1", from: "them", text: "Quanto fica o conserto?", time: "Ontem" }],
    os: [],
    history: [],
  },
  {
    id: "4",
    name: "Ana Paula",
    phone: "+55 11 95555-3322",
    lastMessage: "Vou passar aí amanhã",
    lastTime: "Ontem",
    unread: 0,
    status: "auto",
    stage: "aguardando_cliente",
    responsible: "Bot",
    idleMinutes: 200,
    tags: [],
    clientSince: "Out/2025",
    totalSpent: 320,
    notes: "",
    messages: [{ id: "m1", from: "them", text: "Vou passar aí amanhã", time: "Ontem" }],
    os: [],
    history: [],
  },
  {
    id: "5",
    name: "Roberto Lima",
    phone: "+55 11 97777-1100",
    lastMessage: "Bom dia, tudo bem?",
    lastTime: "08:01",
    unread: 3,
    status: "waiting",
    stage: "novo",
    responsible: "—",
    idleMinutes: 6,
    tags: ["Novo"],
    clientSince: "Hoje",
    totalSpent: 0,
    notes: "",
    messages: [{ id: "m1", from: "them", text: "Bom dia, tudo bem?", time: "08:01" }],
    os: [],
    history: [],
  },
];

export type Trigger =
  | "new_contact"
  | "keyword"
  | "os_created"
  | "os_status_changed"
  | "budget_approved"
  | "os_ready"
  | "payment_pending"
  | "no_reply";

export type Action =
  | "send_message"
  | "create_os"
  | "notify_team"
  | "move_funnel"
  | "send_payment_link"
  | "send_warranty";

export interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: string[];
  action: Action;
  message: string;
  lastRun: string;
  runs: number;
}

export const mockAutomations: Automation[] = [
  { id: "a1", name: "Boas-vindas automática", description: "Envia mensagem ao primeiro contato", enabled: true, trigger: "new_contact", conditions: ["Cliente novo"], action: "send_message", message: "Olá {cliente_nome}! Bem-vindo à {nome_loja}. Como posso ajudar?", lastRun: "há 4 min", runs: 312 },
  { id: "a2", name: "Fora do horário", description: "Resposta automática fora do expediente", enabled: true, trigger: "new_contact", conditions: ["Fora do horário"], action: "send_message", message: "Estamos fora do horário. Retornaremos em breve. ⏰", lastRun: "ontem 22:14", runs: 88 },
  { id: "a3", name: "Status da OS", description: "Notifica cliente sobre andamento", enabled: false, trigger: "os_status_changed", conditions: ["Tem OS aberta"], action: "send_message", message: "Olá {cliente_nome}, sua OS {os_numero} agora está: {status_os}.", lastRun: "—", runs: 0 },
  { id: "a4", name: "Orçamento automático", description: "Envia orçamento após análise", enabled: true, trigger: "os_created", conditions: ["Valor acima de 50"], action: "send_message", message: "Segue seu orçamento da OS {os_numero}: R$ {valor_orcamento}. Prazo: {prazo}.", lastRun: "hoje 09:30", runs: 47 },
  { id: "a5", name: "Cobrança automática", description: "Envia link de pagamento ao finalizar OS", enabled: false, trigger: "os_ready", conditions: ["Pagamento pendente"], action: "send_payment_link", message: "Sua OS {os_numero} está pronta! Pague aqui: [link]", lastRun: "—", runs: 0 },
  { id: "a6", name: "Pós-venda", description: "Mensagem 3 dias após retirada", enabled: true, trigger: "os_ready", conditions: ["Cliente existente"], action: "send_message", message: "Oi {cliente_nome}! Tudo certo com seu equipamento? Conta pra gente! 😊", lastRun: "ontem", runs: 22 },
  { id: "a7", name: "Garantia", description: "Envia info de garantia", enabled: true, trigger: "budget_approved", conditions: [], action: "send_warranty", message: "Seu serviço tem 90 dias de garantia. Guarde sua nota!", lastRun: "hoje 11:02", runs: 18 },
  { id: "a8", name: "Cliente inativo", description: "Reaproxima clientes sem compra há 6 meses", enabled: false, trigger: "no_reply", conditions: ["Cliente existente"], action: "send_message", message: "Faz tempo que não nos vemos! Que tal um check-up no seu equipamento?", lastRun: "—", runs: 0 },
];

export interface QuickReply {
  id: string;
  title: string;
  category: "Boas-vindas" | "Status OS" | "Orçamento" | "Pagamento" | "Garantia" | "Pós-venda";
  shortcut: string;
  message: string;
}

export const mockQuickReplies: QuickReply[] = [
  { id: "q1", title: "Saudação inicial", category: "Boas-vindas", shortcut: "/oi", message: "Olá {cliente_nome}! Em que posso ajudar?" },
  { id: "q2", title: "OS em análise", category: "Status OS", shortcut: "/analise", message: "Sua OS {os_numero} está em análise técnica." },
  { id: "q3", title: "Aparelho pronto", category: "Status OS", shortcut: "/pronto", message: "Seu aparelho está pronto para retirada! 🎉" },
  { id: "q4", title: "Envio de orçamento", category: "Orçamento", shortcut: "/orc", message: "Segue orçamento: R$ {valor_orcamento}. Prazo {prazo}." },
  { id: "q5", title: "Link de pagamento", category: "Pagamento", shortcut: "/pag", message: "Link de pagamento: [link]. Qualquer dúvida me avise!" },
  { id: "q6", title: "Garantia", category: "Garantia", shortcut: "/gar", message: "Seu serviço tem 90 dias de garantia." },
  { id: "q7", title: "Como foi?", category: "Pós-venda", shortcut: "/pos", message: "Tudo certo com o serviço? Avalie nosso atendimento!" },
];

export const variables = [
  "{cliente_nome}",
  "{os_numero}",
  "{status_os}",
  "{valor_orcamento}",
  "{prazo}",
  "{nome_loja}",
  "{telefone_loja}",
];

export const aiSuggestions: { client: string; ai: string }[] = [
  { client: "meu celular caiu e quebrou a tela", ai: "Entendi 😟. Podemos abrir uma OS para avaliação da troca de tela. Qual o modelo do aparelho?" },
  { client: "quanto custa a bateria do iPhone 11?", ai: "A troca de bateria do iPhone 11 fica em torno de R$ 220, com 90 dias de garantia. Quer que eu reserve um horário?" },
  { client: "demora muito? estou sem paciência!", ai: "Peço desculpas pela espera 🙏. Vou priorizar seu atendimento agora mesmo e transferir para um atendente humano." },
];
