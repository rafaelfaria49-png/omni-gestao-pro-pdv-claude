import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useOS } from "@/store/osStore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CHECKLIST_PADRAO,
  type ChecklistEstado,
  type OSPrioridade,
  type OrdemServico,
} from "@/types/os";
import type { ClienteRecord } from "@/data/clientesSeed";
import type { CatalogoServico } from "@/types/servico";
import type { PecaEstoque } from "@/types/estoque";
import { brl } from "@/lib/os/format";
import {
  Trash2, Plus, User, UserPlus, Search, Smartphone, CheckSquare, Wrench, DollarSign,
  CheckCircle2, AlertTriangle, AlertCircle, Phone, FileText, FileSignature, Package, Loader2, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SenhaTipo = "numerica" | "texto" | "padrao";

interface ServicoLinha {
  servicoId: string;
  nome: string;
  custoInterno: number;
  valorVenda: number;
  prazoGarantiaDias: number;
  termoGarantia: string;
  observacao?: string;
  manual?: boolean;
}
interface PecaLinha {
  id: string;
  nome: string;
  sku?: string;
  quantidade: number;
  valorUnitario: number;
  custoUnitario: number;
  manual?: boolean;
}

// Estados do checklist de entrada — cada estado selecionado fica visualmente marcado.
// Cores semânticas de domínio (sucesso/erro/neutro), conforme CORE_RULES §7.
const ESTADOS: { value: ChecklistEstado; label: string; selected: string; icon: typeof CheckCircle2 }[] = [
  { value: "ok", label: "OK", selected: "bg-emerald-500/15 text-emerald-600 border-emerald-500/50", icon: CheckCircle2 },
  { value: "ruim", label: "Ruim", selected: "bg-rose-500/15 text-rose-600 border-rose-500/50", icon: AlertTriangle },
  { value: "nao_testado", label: "N/T", selected: "bg-sky-500/15 text-sky-600 border-sky-500/50", icon: AlertCircle },
];

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function NovaOSModal({ open, onOpenChange }: Props) {
  const { clientes, tecnicos, servicosCatalogo, pecasEstoque, equipamentosModelos, storeId, criarOS, criarCliente } = useOS();
  const navigate = useNavigate();

  // Cliente (selecionado existente OU novo cadastro)
  const [clienteId, setClienteId] = useState<string>("");
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteTipo, setClienteTipo] = useState<"PF" | "PJ">("PF");

  // Equipamento
  const [tipo, setTipo] = useState("Smartphone");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [serie, setSerie] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaTipo, setSenhaTipo] = useState<SenhaTipo>("numerica");
  const [acessorios, setAcessorios] = useState("");

  // Problema
  const [defeito, setDefeito] = useState("");
  const [obs, setObs] = useState("");

  // Checklist
  const [checklist, setChecklist] = useState(
    CHECKLIST_PADRAO.map((c) => ({ ...c, estado: "nao_testado" as ChecklistEstado })),
  );

  // Serviços + peças
  const [servicos, setServicos] = useState<ServicoLinha[]>([]);
  const [pecas, setPecas] = useState<PecaLinha[]>([]);

  // Busca de catálogo (serviços / peças)
  const [servicoBusca, setServicoBusca] = useState("");
  const [pecaBusca, setPecaBusca] = useState("");

  // Serviço manual
  const [servManNome, setServManNome] = useState("");
  const [servManCusto, setServManCusto] = useState(0);
  const [servManValor, setServManValor] = useState(0);
  const [servManGarantia, setServManGarantia] = useState(90);
  const [servManObs, setServManObs] = useState("");

  // Peça / item manual
  const [pecaManNome, setPecaManNome] = useState("");
  const [pecaManCusto, setPecaManCusto] = useState(0);
  const [pecaManValor, setPecaManValor] = useState(0);
  const [pecaManQtd, setPecaManQtd] = useState(1);

  // Operacional
  const [prioridade, setPrioridade] = useState<OSPrioridade>("media");
  const [tecnicoId, setTecnicoId] = useState<string>("");

  // Salvamento + erro visível
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const onPickCliente = (c: ClienteRecord) => {
    setClienteId(c.id);
    setClienteNome(c.nome);
    setClienteTel(c.telefone ?? "");
    setClienteDoc(c.documento ?? "");
    setClienteBusca("");
  };

  const limparCliente = () => {
    setClienteId("");
    setClienteNome("");
    setClienteTel("");
    setClienteDoc("");
    setClienteBusca("");
  };

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.trim().toLowerCase();
    const base = q
      ? clientes.filter(
          (c) =>
            c.nome.toLowerCase().includes(q) ||
            (c.telefone ?? "").toLowerCase().includes(q) ||
            (c.documento ?? "").toLowerCase().includes(q),
        )
      : clientes;
    return base.slice(0, 50);
  }, [clientes, clienteBusca]);

  const servicosFiltrados = useMemo(() => {
    const q = servicoBusca.trim().toLowerCase();
    const base = q ? servicosCatalogo.filter((s) => s.nome.toLowerCase().includes(q)) : servicosCatalogo;
    return base.slice(0, 50);
  }, [servicosCatalogo, servicoBusca]);

  const pecasFiltradas = useMemo(() => {
    const q = pecaBusca.trim().toLowerCase();
    const base = q
      ? pecasEstoque.filter(
          (p) =>
            p.nome.toLowerCase().includes(q) ||
            (p.sku ?? "").toLowerCase().includes(q) ||
            (p.barcode ?? "").toLowerCase().includes(q),
        )
      : pecasEstoque;
    return base.slice(0, 50);
  }, [pecasEstoque, pecaBusca]);

  const addServicoCatalogo = (s: CatalogoServico) => {
    if (servicos.some((x) => x.servicoId === s.id)) return;
    setServicos((prev) => [
      ...prev,
      {
        servicoId: s.id,
        nome: s.nome,
        custoInterno: s.custoInterno,
        valorVenda: s.valorVenda,
        prazoGarantiaDias: s.prazoGarantiaDias,
        termoGarantia: s.termoGarantia,
      },
    ]);
    setServicoBusca("");
  };

  const addServicoManual = () => {
    const nome = servManNome.trim();
    if (!nome) {
      toast.error("Informe a descrição do serviço");
      return;
    }
    setServicos((prev) => [
      ...prev,
      {
        servicoId: `manual-serv-${Date.now()}`,
        nome,
        custoInterno: servManCusto,
        valorVenda: servManValor,
        prazoGarantiaDias: Math.max(0, Math.trunc(servManGarantia)),
        termoGarantia: "",
        observacao: servManObs.trim() || undefined,
        manual: true,
      },
    ]);
    setServManNome(""); setServManCusto(0); setServManValor(0); setServManGarantia(90); setServManObs("");
  };

  const addPecaCatalogo = (p: PecaEstoque) => {
    if (pecas.some((x) => x.id === p.id)) return;
    setPecas((prev) => [
      ...prev,
      { id: p.id, nome: p.nome, sku: p.sku, quantidade: 1, valorUnitario: p.precoVenda, custoUnitario: p.custo },
    ]);
    setPecaBusca("");
  };

  const addPecaManual = () => {
    const nome = pecaManNome.trim();
    if (!nome) {
      toast.error("Informe a descrição da peça / item");
      return;
    }
    setPecas((prev) => [
      ...prev,
      {
        id: `manual-peca-${Date.now()}`,
        nome,
        sku: undefined,
        quantidade: Math.max(1, Math.trunc(pecaManQtd)),
        valorUnitario: pecaManValor,
        custoUnitario: pecaManCusto,
        manual: true,
      },
    ]);
    setPecaManNome(""); setPecaManCusto(0); setPecaManValor(0); setPecaManQtd(1);
  };

  const updServico = (i: number, patch: Partial<ServicoLinha>) =>
    setServicos((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const updPeca = (i: number, patch: Partial<PecaLinha>) =>
    setPecas((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const totais = useMemo(() => {
    const custoServicos = servicos.reduce((s, x) => s + (x.custoInterno || 0), 0);
    const vendaServicos = servicos.reduce((s, x) => s + (x.valorVenda || 0), 0);
    const custoPecas = pecas.reduce((s, x) => s + (x.custoUnitario || 0) * x.quantidade, 0);
    const vendaPecas = pecas.reduce((s, x) => s + (x.valorUnitario || 0) * x.quantidade, 0);
    const custoTotal = custoServicos + custoPecas;
    const vendaTotal = vendaServicos + vendaPecas;
    return { custoTotal, vendaTotal, lucro: vendaTotal - custoTotal };
  }, [servicos, pecas]);

  const maiorGarantia = useMemo(
    () => servicos.reduce((max, s) => Math.max(max, s.prazoGarantiaDias), 0),
    [servicos],
  );

  const reset = () => {
    limparCliente();
    setClienteTipo("PF");
    setTipo("Smartphone"); setMarca(""); setModelo(""); setSerie(""); setSenha(""); setSenhaTipo("numerica"); setAcessorios("");
    setDefeito(""); setObs("");
    setChecklist(CHECKLIST_PADRAO.map((c) => ({ ...c, estado: "nao_testado" as ChecklistEstado })));
    setServicos([]); setPecas([]);
    setServicoBusca(""); setPecaBusca("");
    setServManNome(""); setServManCusto(0); setServManValor(0); setServManGarantia(90); setServManObs("");
    setPecaManNome(""); setPecaManCusto(0); setPecaManValor(0); setPecaManQtd(1);
    setPrioridade("media"); setTecnicoId("");
    setErro(null);
  };

  const handleSalvar = async () => {
    setErro(null);
    if (!marca.trim() || !modelo.trim()) {
      setErro("Informe marca e modelo do equipamento.");
      toast.error("Informe marca e modelo do equipamento");
      return;
    }
    if (!defeito.trim()) {
      setErro("Descreva o defeito relatado.");
      toast.error("Descreva o defeito relatado");
      return;
    }
    const temSelecionado = !!clienteId;
    const temNovo = !temSelecionado && !!clienteNome.trim();
    if (!temSelecionado && !temNovo) {
      setErro("Selecione um cliente existente ou cadastre um novo (informe ao menos o nome).");
      toast.error("Selecione ou cadastre um cliente");
      return;
    }

    setSalvando(true);
    try {
      // 1. Resolve um cliente REAL — nunca um id temporário (evita violar a FK da OS).
      let clienteRealId = clienteId;
      let nomeFinal = clienteNome.trim();
      let telFinal = clienteTel.trim();
      let docFinal = clienteDoc.trim();
      if (!clienteRealId) {
        const novo = await criarCliente({
          nome: nomeFinal,
          telefone: telFinal || undefined,
          documento: docFinal || undefined,
          tipo: clienteTipo,
        });
        clienteRealId = novo.id;
        nomeFinal = novo.nome;
        telFinal = novo.telefone ?? telFinal;
        docFinal = novo.documento ?? docFinal;
      }

      const tecnico = tecnicos.find((t) => t.id === tecnicoId);
      const modeloMatch = equipamentosModelos.find((m) => {
        const nameOk = m.name.trim().toLowerCase() === modelo.trim().toLowerCase();
        const brandOk = !marca.trim() || m.brand.trim().toLowerCase() === marca.trim().toLowerCase();
        return nameOk && brandOk;
      });
      const prazoMs = 24 * 3600 * 1000 * 2;
      const termoConsolidado = servicos
        .filter((s) => s.termoGarantia)
        .map((s) => `▸ ${s.nome} (${s.prazoGarantiaDias} dias)\n${s.termoGarantia}`)
        .join("\n\n---\n\n");

      const novaOS: Omit<OrdemServico, "id" | "codigo" | "criadoEm" | "atualizadoEm" | "timeline"> = {
        storeId,
        clienteId: clienteRealId,
        cliente: {
          id: clienteRealId,
          nome: nomeFinal,
          telefone: telFinal || undefined,
          whatsapp: telFinal || undefined,
          documento: docFinal || undefined,
        },
        equipamento: {
          id: `eq_${Date.now()}`,
          tipo, marca, modelo,
          numeroSerie: serie || undefined,
          acessorios: acessorios ? acessorios.split(",").map((x) => x.trim()).filter(Boolean) : [],
          defeitoRelatado: defeito,
          defeitosComuns: modeloMatch?.commonDefects?.length ? modeloMatch.commonDefects : undefined,
          checklistRecomendado: modeloMatch?.recommendedChecklist?.length ? modeloMatch.recommendedChecklist : undefined,
        },
        status: "aberta",
        prioridade,
        origem: "balcao",
        tecnico,
        sla: { prazo: new Date(Date.now() + prazoMs).toISOString(), status: "ok" },
        pecas: pecas.map((p) => ({
          id: p.id,
          produtoId: p.manual ? undefined : p.id,
          nome: p.nome,
          sku: p.sku,
          quantidade: p.quantidade,
          valorUnitario: p.valorUnitario,
          custoUnitario: p.custoUnitario,
          produtoOrigem: p.manual ? "manual" : "prisma",
        })),
        observacoes: obs ? [{ id: `ob_${Date.now()}`, autor: "Você", conteudo: obs, interna: true, criadoEm: new Date().toISOString() }] : [],
        anexos: [],
        garantia: maiorGarantia > 0
          ? { ativa: false, prazoDias: maiorGarantia, termo: termoConsolidado || undefined }
          : { ativa: false },
        checklist,
        senhaEquipamento: senha || undefined,
        senhaEquipamentoTipo: senha ? senhaTipo : undefined,
        observacaoCliente: undefined,
        servicosCatalogo: servicos.map((s) => ({
          servicoId: s.servicoId,
          descricao: s.nome,
          custoInterno: s.custoInterno,
          valorVenda: s.valorVenda,
          prazoGarantiaDias: s.prazoGarantiaDias,
          termoGarantia: s.termoGarantia,
          observacao: s.observacao,
        })),
      };

      const criada = await criarOS(novaOS);
      toast.success(`${criada.codigo} criada com sucesso`);
      onOpenChange(false);
      reset();
      navigate(`/operacoes/os/${criada.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao criar OS";
      setErro(msg);
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  const fieldCls = "h-12 bg-background/50 border-border/60 focus-visible:ring-primary/20 transition-all text-base";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!salvando) onOpenChange(o); }}>
      <DialogContent className="w-[95vw] !max-w-[1100px] max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl sm:rounded-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FileSignature className="h-4 w-4" />
            </div>
            Nova Ordem de Serviço
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="cliente" className="w-full flex flex-col">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-muted/40">
              <TabsTrigger value="cliente" className="py-2.5 flex items-center justify-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                <User className="h-4 w-4 opacity-70" />
                <span className="truncate">Cliente</span>
              </TabsTrigger>
              <TabsTrigger value="equipamento" className="py-2.5 flex items-center justify-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                <Smartphone className="h-4 w-4 opacity-70" />
                <span className="truncate">Equipamento</span>
              </TabsTrigger>
              <TabsTrigger value="checklist" className="py-2.5 flex items-center justify-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                <CheckSquare className="h-4 w-4 opacity-70" />
                <span className="truncate">Checklist</span>
              </TabsTrigger>
              <TabsTrigger value="servicos" className="py-2.5 flex items-center justify-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                <Wrench className="h-4 w-4 opacity-70" />
                <span className="truncate">Serviços / Peças</span>
              </TabsTrigger>
              <TabsTrigger value="financeiro" className="py-2.5 flex items-center justify-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
                <DollarSign className="h-4 w-4 opacity-70" />
                <span className="truncate">Financeiro</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* CLIENTE */}
          <TabsContent value="cliente" className="px-6 pb-6 pt-4 m-0 focus-visible:outline-none">
            <div className="bg-card/40 border border-border/50 rounded-2xl p-7 space-y-6 shadow-sm">
              {clienteId ? (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-primary/70 font-bold mb-1">Cliente selecionado</div>
                    <div className="text-base font-semibold text-foreground truncate">{clienteNome}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[clienteTel, clienteDoc].filter(Boolean).join(" · ") || "Sem telefone/documento"}
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 border-border" onClick={limparCliente}>
                    Trocar cliente
                  </Button>
                </div>
              ) : (
                <>
                  {/* Buscar existente */}
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2 block">Buscar cliente existente</Label>
                    <div className="relative flex items-center">
                      <Search className="absolute left-3.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
                      <Input
                        className={cn(fieldCls, "!pl-11")}
                        value={clienteBusca}
                        onChange={(e) => setClienteBusca(e.target.value)}
                        placeholder="Nome, telefone ou CPF/CNPJ..."
                      />
                    </div>
                    {clienteBusca.trim() && (
                      <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/40">
                        {clientesFiltrados.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground">
                            Nenhum cliente encontrado. Cadastre um novo abaixo.
                          </div>
                        ) : (
                          clientesFiltrados.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => onPickCliente(c)}
                              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-primary/5 transition-colors"
                            >
                              <span className="min-w-0 truncate text-sm font-medium text-foreground">{c.nome}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{c.telefone || "—"}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Novo cliente */}
                  <div className="pt-4 border-t border-border/40 space-y-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <UserPlus className="h-4 w-4 text-primary" /> Cadastrar novo cliente
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Nome *</Label>
                        <div className="relative flex items-center">
                          <User className="absolute left-3.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
                          <Input className={cn(fieldCls, "!pl-11")} value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} maxLength={120} placeholder="Nome do cliente" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Telefone / WhatsApp</Label>
                        <div className="relative flex items-center">
                          <Phone className="absolute left-3.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
                          <Input className={cn(fieldCls, "!pl-11")} value={clienteTel} onChange={(e) => setClienteTel(e.target.value)} maxLength={20} placeholder="(11) 99999-0000" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">CPF / CNPJ</Label>
                        <div className="relative flex items-center">
                          <FileText className="absolute left-3.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
                          <Input className={cn(fieldCls, "!pl-11")} value={clienteDoc} onChange={(e) => setClienteDoc(e.target.value)} maxLength={20} placeholder="000.000.000-00" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Tipo</Label>
                        <Select value={clienteTipo} onValueChange={(v) => setClienteTipo(v as "PF" | "PJ")}>
                          <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PF">Pessoa Física</SelectItem>
                            <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O cliente é cadastrado de verdade ao criar a OS. Telefone e documento podem ser completados depois em Cadastros.
                    </p>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* EQUIPAMENTO */}
          <TabsContent value="equipamento" className="px-6 pb-6 pt-4 m-0 focus-visible:outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Esquerda: Infos Básicas */}
              <div className="lg:col-span-7 bg-card/40 border border-border/50 rounded-2xl p-7 shadow-sm space-y-6">
                <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2 border-b border-border/40 pb-4">
                  <Smartphone className="h-5 w-5 text-primary" /> Identificação do Aparelho
                </h3>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Tipo</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Smartphone", "Notebook", "Tablet", "Impressora", "Console", "Outro"].map((t) => (
                          <SelectItem key={t} value={t} className="py-2">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Marca *</Label>
                    <Input className={fieldCls} value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={40} list="og_operacoes_marcas" placeholder="Ex: Apple, Samsung..." />
                    <datalist id="og_operacoes_marcas">{Array.from(new Set(equipamentosModelos.map((m) => m.brand).filter(Boolean))).map((b) => <option key={b} value={b} />)}</datalist>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Modelo *</Label>
                    <Input className={fieldCls} value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={60} list="og_operacoes_modelos" placeholder="Ex: iPhone 13 Pro" />
                    <datalist id="og_operacoes_modelos">{equipamentosModelos.filter((m) => !marca.trim() || m.brand.toLowerCase() === marca.trim().toLowerCase()).map((m) => <option key={m.id} value={m.name} />)}</datalist>
                  </div>
                  <div className="space-y-2"><Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">IMEI / Nº de série</Label><Input className={fieldCls} value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={40} inputMode="numeric" /></div>
                  <div className="space-y-2 md:col-span-2"><Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Acessórios entregues</Label><Input className={fieldCls} value={acessorios} onChange={(e) => setAcessorios(e.target.value)} maxLength={120} placeholder="Carregador, capa, cabo... (separe por vírgula)" /></div>
                </div>

                {/* Senha / desbloqueio */}
                <div className="space-y-3 pt-2 border-t border-border/40">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" /> Senha / desbloqueio do aparelho
                  </Label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Select value={senhaTipo} onValueChange={(v) => setSenhaTipo(v as SenhaTipo)}>
                      <SelectTrigger className={cn(fieldCls, "sm:max-w-[220px] shrink-0")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="numerica">Numérica / PIN</SelectItem>
                        <SelectItem value="texto">Texto (alfanumérica)</SelectItem>
                        <SelectItem value="padrao">Padrão (desenho)</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="min-w-0 flex-1">
                      {senhaTipo === "padrao" ? (
                        <Textarea
                          className="min-h-[88px] resize-y bg-background/50 border-border/60 focus-visible:ring-primary/20 text-base p-3"
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                          maxLength={200}
                          placeholder="Descreva o desenho (ex.: L invertido começando no ponto superior esquerdo)..."
                        />
                      ) : (
                        <Input
                          className={fieldCls}
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                          maxLength={40}
                          inputMode={senhaTipo === "numerica" ? "numeric" : "text"}
                          autoComplete="off"
                          placeholder={senhaTipo === "numerica" ? "Ex.: 1234 ou 000000" : "Senha do aparelho"}
                        />
                      )}
                    </div>
                  </div>
                  {senhaTipo === "padrao" && (
                    <p className="text-xs text-muted-foreground">
                      Captura visual do desenho de 9 pontos: prevista para fase futura. Por ora, descreva o padrão em texto.
                    </p>
                  )}
                </div>
              </div>

              {/* Direita: Problema e Obs */}
              <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="bg-card/40 border border-border/50 rounded-2xl p-7 shadow-sm space-y-5 flex-1 flex flex-col">
                  <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2 border-b border-border/40 pb-4">
                    <AlertCircle className="h-5 w-5 text-rose-500" /> Relato do Cliente
                  </h3>
                  <div className="flex-1 flex flex-col space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Defeito relatado *</Label>
                    <Textarea className="flex-1 min-h-[120px] resize-none bg-background/50 border-border/60 focus-visible:ring-primary/20 text-base p-4" value={defeito} onChange={(e) => setDefeito(e.target.value)} maxLength={1000} placeholder="Descreva exatamente o que o cliente informou..." />
                  </div>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-7 shadow-sm space-y-5">
                  <div className="space-y-2">
                    <Label className="text-amber-700/80 dark:text-amber-500/80 text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                      Observações internas
                    </Label>
                    <Textarea className="h-24 resize-none bg-background/50 border-amber-500/30 focus-visible:ring-amber-500/30 text-base p-4" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} placeholder="Visível apenas para a equipe técnica..." />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* CHECKLIST */}
          <TabsContent value="checklist" className="px-6 pb-6 pt-4 m-0 focus-visible:outline-none">
            <div className="bg-card/40 border border-border/50 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/40">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Inspeção Visual (Entrada)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Marque o estado de cada componente ao receber o aparelho. <span className="text-emerald-600 font-medium">OK</span> · <span className="text-rose-600 font-medium">Ruim</span> · <span className="text-sky-600 font-medium">N/T</span> (não testado / não tem).</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {checklist.map((item, idx) => (
                  <div key={item.id} className="flex flex-col justify-between rounded-xl border border-border/60 bg-background/50 p-4 transition-all hover:border-primary/30">
                    <span className="text-sm font-semibold tracking-tight mb-3">{item.label}</span>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/30 rounded-lg">
                      {ESTADOS.map((e) => {
                        const isSelected = item.estado === e.value;
                        const Icon = e.icon;
                        return (
                          <button
                            key={e.value}
                            type="button"
                            onClick={() => setChecklist((prev) => prev.map((it, i) => (i === idx ? { ...it, estado: e.value } : it)))}
                            className={cn(
                              "flex flex-col items-center justify-center py-2 rounded-md text-[10px] uppercase font-bold tracking-wider border transition-all duration-200",
                              isSelected ? e.selected : "border-transparent text-muted-foreground/60 hover:bg-background/80 hover:text-foreground",
                            )}
                          >
                            <Icon className={cn("h-3.5 w-3.5 mb-1", isSelected ? "" : "opacity-50")} />
                            {e.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* SERVIÇOS / PEÇAS */}
          <TabsContent value="servicos" className="px-6 pb-6 pt-4 m-0 focus-visible:outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Serviços */}
              <div className="bg-card/40 border border-border/50 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground/80 flex items-center gap-2 border-b border-border/40 pb-3">
                  <Wrench className="h-4 w-4 text-primary" /> Serviços a realizar
                </h3>

                {/* Catálogo (busca) — só quando há itens */}
                {servicosCatalogo.length > 0 ? (
                  <div className="space-y-2">
                    <div className="relative flex items-center">
                      <Search className="absolute left-3 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                      <Input className="h-10 pl-9 bg-background/50 border-border/60" value={servicoBusca} onChange={(e) => setServicoBusca(e.target.value)} placeholder="Buscar serviço no catálogo..." />
                    </div>
                    {servicoBusca.trim() && (
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                        {servicosFiltrados.length === 0 ? (
                          <div className="p-3 text-xs text-muted-foreground">Nenhum serviço no catálogo bate com a busca.</div>
                        ) : (
                          servicosFiltrados.map((s) => (
                            <button key={s.id} type="button" onClick={() => addServicoCatalogo(s)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary/5 transition-colors">
                              <span className="min-w-0 truncate text-sm">{s.nome}</span>
                              <span className="shrink-0 text-xs font-semibold text-foreground">{brl(s.valorVenda)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                    Nenhum serviço no catálogo desta loja. Adicione um serviço manual abaixo ou cadastre o catálogo em Cadastros.
                  </div>
                )}

                {/* Serviço manual */}
                <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adicionar serviço manual</div>
                  <Input className="h-9 bg-background/50 border-border/60" value={servManNome} onChange={(e) => setServManNome(e.target.value)} placeholder="Descrição (ex.: Troca de tela)" />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Custo (R$)</Label>
                      <Input type="number" min={0} step="0.01" className="h-9 bg-background/50 border-border/60" value={servManCusto || ""} onChange={(e) => setServManCusto(num(e.target.value))} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Cliente (R$)</Label>
                      <Input type="number" min={0} step="0.01" className="h-9 bg-background/50 border-border/60" value={servManValor || ""} onChange={(e) => setServManValor(num(e.target.value))} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Garantia (dias)</Label>
                      <Input type="number" min={0} className="h-9 bg-background/50 border-border/60" value={servManGarantia || ""} onChange={(e) => setServManGarantia(num(e.target.value))} placeholder="90" />
                    </div>
                  </div>
                  <Input className="h-9 bg-background/50 border-border/60" value={servManObs} onChange={(e) => setServManObs(e.target.value)} placeholder="Observação (opcional)" />
                  <Button type="button" size="sm" variant="outline" className="w-full border-border" onClick={addServicoManual}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar serviço
                  </Button>
                </div>

                {/* Lista de serviços adicionados */}
                {servicos.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {servicos.map((s, i) => (
                      <div key={s.servicoId} className="rounded-lg border border-border/60 bg-background/50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{s.nome}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Garantia: {s.prazoGarantiaDias} dias{s.manual ? " · manual" : ""}
                            </div>
                          </div>
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10" onClick={() => setServicos((p) => p.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {s.observacao && <div className="text-[11px] text-muted-foreground mt-1 italic">{s.observacao}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Peças */}
              <div className="bg-card/40 border border-border/50 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground/80 flex items-center gap-2 border-b border-border/40 pb-3">
                  <Package className="h-4 w-4 text-primary" /> Peças utilizadas
                </h3>

                {/* Busca no estoque */}
                <div className="space-y-2">
                  <div className="relative flex items-center">
                    <Search className="absolute left-3 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                    <Input className="h-10 pl-9 bg-background/50 border-border/60" value={pecaBusca} onChange={(e) => setPecaBusca(e.target.value)} placeholder="Buscar por nome, SKU ou código de barras..." />
                  </div>
                  {pecaBusca.trim() && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                      {pecasFiltradas.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground">Nenhuma peça encontrada. Use o item manual abaixo.</div>
                      ) : (
                        pecasFiltradas.map((p) => {
                          const semEstoque = p.estoqueAtual <= 0;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={semEstoque}
                              onClick={() => addPecaCatalogo(p)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{p.nome}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{p.sku && p.sku !== "—" ? p.sku : "Sem SKU"}{p.barcode ? ` · ${p.barcode}` : ""}</div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-semibold text-foreground">{brl(p.precoVenda)}</div>
                                <div className={cn("text-[11px]", semEstoque ? "text-rose-500" : "text-muted-foreground")}>estoque: {p.estoqueAtual}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Item manual */}
                <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adicionar item avulso / manual</div>
                  <Input className="h-9 bg-background/50 border-border/60" value={pecaManNome} onChange={(e) => setPecaManNome(e.target.value)} placeholder="Descrição (ex.: Conector de carga genérico)" />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Custo (R$)</Label>
                      <Input type="number" min={0} step="0.01" className="h-9 bg-background/50 border-border/60" value={pecaManCusto || ""} onChange={(e) => setPecaManCusto(num(e.target.value))} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Cliente (R$)</Label>
                      <Input type="number" min={0} step="0.01" className="h-9 bg-background/50 border-border/60" value={pecaManValor || ""} onChange={(e) => setPecaManValor(num(e.target.value))} placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Qtd</Label>
                      <Input type="number" min={1} className="h-9 bg-background/50 border-border/60" value={pecaManQtd || ""} onChange={(e) => setPecaManQtd(Math.max(1, num(e.target.value)))} placeholder="1" />
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="w-full border-border" onClick={addPecaManual}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar item
                  </Button>
                  <p className="text-[10px] text-muted-foreground">Itens manuais não movimentam o estoque (peça não cadastrada).</p>
                </div>

                {/* Lista de peças adicionadas */}
                {pecas.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {pecas.map((p, i) => (
                      <div key={p.id} className="group flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{p.nome}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{p.manual ? "Item manual" : p.sku && p.sku !== "—" ? p.sku : "Sem SKU"}</div>
                        </div>
                        <Input type="number" min={1} className="w-16 h-8 text-center bg-background/50" value={p.quantidade} onChange={(e) => updPeca(i, { quantidade: Math.max(1, num(e.target.value)) })} />
                        <span className="w-20 text-right text-sm font-bold text-foreground">{brl(p.valorUnitario * p.quantidade)}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10" onClick={() => setPecas((prev) => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* FINANCEIRO */}
          <TabsContent value="financeiro" className="px-6 pb-6 pt-4 m-0 focus-visible:outline-none">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="relative overflow-hidden rounded-xl border border-border/50 bg-background/40 p-5 shadow-sm">
                <div className="absolute -right-4 -top-4 opacity-5"><DollarSign className="h-24 w-24" /></div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Custo Total (Interno)</div>
                <div className="text-2xl font-display font-semibold text-amber-500">{brl(totais.custoTotal)}</div>
                <Badge variant="outline" className="mt-3 text-[9px] uppercase tracking-wider bg-amber-500/5 text-amber-500 border-amber-500/20">Oculto do cliente</Badge>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-sm">
                <div className="absolute -right-4 -top-4 opacity-5 text-primary"><DollarSign className="h-24 w-24" /></div>
                <div className="text-[10px] uppercase tracking-widest text-primary/70 font-bold mb-1">Total ao Cliente</div>
                <div className="text-2xl font-display font-bold text-primary">{brl(totais.vendaTotal)}</div>
              </div>
              <div className={cn("relative overflow-hidden rounded-xl border p-5 shadow-sm", totais.lucro >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20")}>
                <div className={cn("absolute -right-4 -top-4 opacity-5", totais.lucro >= 0 ? "text-emerald-500" : "text-rose-500")}><DollarSign className="h-24 w-24" /></div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Lucro Estimado</div>
                <div className={cn("text-2xl font-display font-bold", totais.lucro >= 0 ? "text-emerald-600" : "text-rose-600")}>{brl(totais.lucro)}</div>
              </div>
            </div>

            {/* Ajuste de valores por item — custo interno e valor ao cliente editáveis */}
            <div className="bg-card/40 border border-border/50 rounded-xl p-5 shadow-sm space-y-3 mb-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight text-foreground/80">Ajuste de valores</h3>
                <span className="text-[11px] text-muted-foreground">Catálogo é sugestão — ajuste livre antes de criar a OS.</span>
              </div>
              {servicos.length === 0 && pecas.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                  Nenhum serviço ou peça adicionado. Adicione na aba <span className="font-semibold text-foreground">Serviços / Peças</span>.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Cabeçalho */}
                  <div className="hidden sm:grid grid-cols-[1fr_110px_110px_70px] gap-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    <span>Item</span>
                    <span className="text-right flex items-center justify-end gap-1"><Lock className="h-3 w-3" /> Custo</span>
                    <span className="text-right">Cliente</span>
                    <span className="text-right">Subtotal</span>
                  </div>
                  {servicos.map((s, i) => (
                    <div key={s.servicoId} className="grid grid-cols-2 sm:grid-cols-[1fr_110px_110px_70px] gap-2 items-center rounded-lg border border-border/50 bg-background/40 p-2">
                      <div className="col-span-2 sm:col-span-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.nome}</div>
                        <div className="text-[10px] text-muted-foreground">Serviço</div>
                      </div>
                      <Input type="number" min={0} step="0.01" className="h-9 text-right bg-background/50 border-amber-500/30" value={s.custoInterno || ""} onChange={(e) => updServico(i, { custoInterno: num(e.target.value) })} placeholder="0,00" />
                      <Input type="number" min={0} step="0.01" className="h-9 text-right bg-background/50 border-border/60" value={s.valorVenda || ""} onChange={(e) => updServico(i, { valorVenda: num(e.target.value) })} placeholder="0,00" />
                      <span className="text-right text-sm font-semibold tabular-nums">{brl(s.valorVenda)}</span>
                    </div>
                  ))}
                  {pecas.map((p, i) => (
                    <div key={p.id} className="grid grid-cols-2 sm:grid-cols-[1fr_110px_110px_70px] gap-2 items-center rounded-lg border border-border/50 bg-background/40 p-2">
                      <div className="col-span-2 sm:col-span-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.nome}</div>
                        <div className="text-[10px] text-muted-foreground">Peça · {p.quantidade}×</div>
                      </div>
                      <Input type="number" min={0} step="0.01" className="h-9 text-right bg-background/50 border-amber-500/30" value={p.custoUnitario || ""} onChange={(e) => updPeca(i, { custoUnitario: num(e.target.value) })} placeholder="0,00" />
                      <Input type="number" min={0} step="0.01" className="h-9 text-right bg-background/50 border-border/60" value={p.valorUnitario || ""} onChange={(e) => updPeca(i, { valorUnitario: num(e.target.value) })} placeholder="0,00" />
                      <span className="text-right text-sm font-semibold tabular-nums">{brl(p.valorUnitario * p.quantidade)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card/40 border border-border/50 rounded-xl p-5 shadow-sm space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Prioridade</Label>
                  <Select value={prioridade} onValueChange={(v) => setPrioridade(v as OSPrioridade)}>
                    <SelectTrigger className="h-11 bg-background/50 border-border/60 focus:ring-primary/20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="critica">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Técnico responsável</Label>
                  <Select value={tecnicoId} onValueChange={setTecnicoId}>
                    <SelectTrigger className="h-11 bg-background/50 border-border/60 focus:ring-primary/20"><SelectValue placeholder="Atribuir depois" /></SelectTrigger>
                    <SelectContent>
                      {tecnicos.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">Nenhum técnico cadastrado.</div>
                      ) : (
                        tecnicos.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome} {t.online ? "· online" : ""}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {maiorGarantia > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <p>
                    <strong>Garantia consolidada de {maiorGarantia} dias</strong> aplicável a esta Ordem de Serviço, com base no maior prazo dos serviços selecionados.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="sticky bottom-0 z-10 flex-col gap-3 px-6 py-4 border-t border-border/40 bg-background/95 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          {erro ? (
            <p className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 sm:flex-1 sm:min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0">{erro}</span>
            </p>
          ) : (
            <span className="hidden sm:block sm:flex-1 text-xs text-muted-foreground">Cliente, marca/modelo e defeito são obrigatórios.</span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando} className="hover:bg-rose-500/10 hover:text-rose-500 transition-colors">Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando} className="bg-primary hover:bg-primary/90 text-primary-foreground transition-all">
              {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              {salvando ? "Criando..." : "Criar Ordem de Serviço"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
