import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  History,
  PlusCircle,
  ShieldCheck,
  Users,
  Zap,
  Wrench,
} from "lucide-react";
import { HubCard, type HubCardProps } from "@/components/operacoes/HubCard";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { NovaOSModal } from "@/components/operacoes/NovaOSModal";
import { AtendimentoRapidoModal } from "@/components/operacoes/AtendimentoRapidoModal";
import { useOS } from "@/store/osStore";
import { slaRestante } from "@/lib/os/format";

type CardId =
  | "nova-os"
  | "os-andamento"
  | "atendimento-rapido"
  | "historico-clientes"
  | "garantias"
  | "tecnicos"
  | "servicos";

type HubCardData = Omit<HubCardProps, "icon" | "onClick"> & {
  icon: HubCardProps["icon"];
  id: CardId;
};

const OperacoesHub = () => {
  const { ordens, tecnicos, atendimentos, servicosCatalogo } = useOS();
  const navigate = useNavigate();
  const [novaOSOpen, setNovaOSOpen] = useState(false);
  const [atendimentoOpen, setAtendimentoOpen] = useState(false);

  const stats = useMemo(() => {
    const abertas = ordens.filter((o) => !["entregue", "cancelada"].includes(o.status));
    const atrasadas = abertas.filter((o) => slaRestante(o.sla.prazo).status === "estourado").length;
    const aguardando = ordens.filter((o) => o.status === "aguardando_aprovacao").length;
    const prontas = ordens.filter((o) => o.status === "pronta").length;
    const garantiasAtivas = ordens.filter((o) => o.garantia.ativa).length;
    const tecOnline = tecnicos.filter((t) => t.online).length;
    const ocupados = ordens.filter((o) => o.status === "em_execucao" && o.tecnico).length;
    return {
      abertas: abertas.length,
      atrasadas,
      aguardando,
      prontas,
      garantiasAtivas,
      tecOnline,
      tecTotal: tecnicos.length,
      ocupados,
    };
  }, [ordens, tecnicos]);

  const handleClick = (id: CardId) => {
    switch (id) {
      case "nova-os": return setNovaOSOpen(true);
      case "atendimento-rapido": return setAtendimentoOpen(true);
      case "os-andamento": return navigate("/operacoes/os");
      case "historico-clientes": return navigate("/operacoes/historico");
      case "garantias": return navigate("/operacoes/garantias");
      case "tecnicos": return navigate("/operacoes/tecnicos");
      case "servicos": return navigate("/operacoes/servicos");
    }
  };

  const cards: HubCardData[] = [
    {
      id: "nova-os",
      title: "Nova Ordem de Serviço",
      description: "Cliente, equipamento, checklist e serviços em um único fluxo.",
      icon: PlusCircle,
      status: "ativo",
      primaryValue: "+ Abrir",
      primaryLabel: "Atalho rápido",
      metrics: [{ label: "Pipeline", value: stats.abertas }],
      action: "Criar OS",
      accent: "from-emerald-500/10 to-transparent",
    },
    {
      id: "os-andamento",
      title: "Ordens em andamento",
      description: "Kanban com SLA, prioridade e técnico responsável.",
      icon: ClipboardList,
      status: stats.atrasadas > 0 ? "atencao" : "andamento",
      primaryValue: stats.abertas,
      primaryLabel: "OS abertas",
      metrics: [
        { label: "Atrasadas", value: stats.atrasadas },
        { label: "Aguard.", value: stats.aguardando },
      ],
      action: "Abrir Kanban",
      accent: "from-sky-500/10 to-transparent",
    },
    {
      id: "atendimento-rapido",
      title: "Atendimento rápido",
      description: "Rascunho local nesta sessão — não persiste no servidor. Para histórico real, use OS.",
      icon: Zap,
      status: "neutro",
      primaryValue: atendimentos.length,
      primaryLabel: "Nesta sessão",
      metrics: [{ label: "Tipo", value: "Rascunho" }],
      action: "Registrar rascunho",
      accent: "from-violet-500/10 to-transparent",
    },
    {
      id: "historico-clientes",
      title: "Histórico de clientes",
      description: "Timeline completa de atendimentos e total investido.",
      icon: History,
      status: "neutro",
      primaryValue: new Set(ordens.map((o) => o.clienteId)).size,
      primaryLabel: "Clientes únicos",
      metrics: [{ label: "OS totais", value: ordens.length }],
      action: "Buscar cliente",
      accent: "from-primary/10 to-transparent",
    },
    {
      id: "garantias",
      title: "Garantias e pós-venda",
      description: "Controle de garantias, retornos e satisfação.",
      icon: ShieldCheck,
      status: stats.garantiasAtivas > 0 ? "atencao" : "neutro",
      primaryValue: stats.garantiasAtivas,
      primaryLabel: "Garantias ativas",
      metrics: [],
      action: "Revisar",
      accent: "from-amber-500/10 to-transparent",
    },
    {
      id: "tecnicos",
      title: "Técnicos / fila",
      description: "Distribuição de chamados e disponibilidade da equipe.",
      icon: Users,
      status: "andamento",
      primaryValue: `${stats.tecOnline}/${stats.tecTotal}`,
      primaryLabel: "Técnicos online",
      metrics: [{ label: "Ocupados", value: stats.ocupados }],
      action: "Gerenciar fila",
      accent: "from-cyan-500/10 to-transparent",
    },
    {
      id: "servicos",
      title: "Catálogo de serviços",
      description: "Cadastro de serviços, preços e termos de garantia.",
      icon: Wrench,
      status: "ativo",
      primaryValue: servicosCatalogo.length,
      primaryLabel: "Serviços ativos",
      metrics: [{ label: "Categorias", value: new Set(servicosCatalogo.map((s) => s.categoria)).size }],
      action: "Gerenciar",
      accent: "from-indigo-500/10 to-transparent",
    },
  ];

  const kpis = [
    { label: "OS abertas", value: String(stats.abertas), trend: null, up: true },
    { label: "Atrasadas (SLA)", value: String(stats.atrasadas), trend: null, up: stats.atrasadas === 0 },
    { label: "Aguardando aprov.", value: String(stats.aguardando), trend: null, up: true },
    { label: "Prontas", value: String(stats.prontas), trend: null, up: true },
  ];

  return (
    <OperacoesLayout>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-2">
              <span className={`text-2xl font-semibold ${!k.up && Number(k.value) > 0 ? "text-rose-500" : ""}`}>{k.value}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Módulos operacionais</h2>
          <span className="text-xs text-muted-foreground">{cards.length} módulos</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <HubCard key={c.id} {...c} onClick={() => handleClick(c.id)} />
          ))}
        </div>
      </section>

      <NovaOSModal open={novaOSOpen} onOpenChange={setNovaOSOpen} />
      <AtendimentoRapidoModal open={atendimentoOpen} onOpenChange={setAtendimentoOpen} />
    </OperacoesLayout>
  );
};

export default OperacoesHub;
