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
import type { CatalogoServico } from "@/types/servico";
import type { PecaEstoque } from "@/types/estoque";
import { brl } from "@/lib/os/format";
import { 
  Trash2, Plus, User, Smartphone, CheckSquare, Wrench, DollarSign,
  CheckCircle2, AlertTriangle, AlertCircle, Phone, FileText, FileSignature
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ServicoLinha {
  servicoId: string;
  nome: string;
  custoInterno: number;
  valorVenda: number;
  prazoGarantiaDias: number;
  termoGarantia: string;
}
interface PecaLinha {
  id: string;
  nome: string;
  sku?: string;
  quantidade: number;
  valorUnitario: number;
  custoUnitario: number;
}

const ESTADOS: { value: ChecklistEstado; label: string; cls: string; icon: any }[] = [
  { value: "ok", label: "OK", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]", icon: CheckCircle2 },
  { value: "ruim", label: "Ruim", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.15)]", icon: AlertTriangle },
  { value: "nao_testado", label: "N/T", cls: "bg-muted/50 text-muted-foreground border-border/50", icon: AlertCircle },
];

export function NovaOSModal({ open, onOpenChange }: Props) {
  const { clientes, tecnicos, servicosCatalogo, pecasEstoque, equipamentosModelos, storeId, criarOS } = useOS();
  const navigate = useNavigate();

  // Cliente
  const [clienteId, setClienteId] = useState<string>("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");

  // Equipamento
  const [tipo, setTipo] = useState("Smartphone");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [serie, setSerie] = useState("");
  const [senha, setSenha] = useState("");
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

  // Operacional
  const [prioridade, setPrioridade] = useState<OSPrioridade>("media");
  const [tecnicoId, setTecnicoId] = useState<string>("");

  const onPickCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c) {
      setClienteNome(c.nome);
      setClienteTel(c.telefone ?? "");
      setClienteDoc(c.documento ?? "");
    }
  };

  const addServico = (s: CatalogoServico) => {
    if (servicos.find((x) => x.servicoId === s.id)) return;
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
  };

  const addPeca = (p: PecaEstoque) => {
    if (pecas.find((x) => x.id === p.id)) return;
    setPecas((prev) => [
      ...prev,
      { id: p.id, nome: p.nome, sku: p.sku, quantidade: 1, valorUnitario: p.precoVenda, custoUnitario: p.custo },
    ]);
  };

  const totais = useMemo(() => {
    const custoServicos = servicos.reduce((s, x) => s + x.custoInterno, 0);
    const vendaServicos = servicos.reduce((s, x) => s + x.valorVenda, 0);
    const custoPecas = pecas.reduce((s, x) => s + x.custoUnitario * x.quantidade, 0);
    const vendaPecas = pecas.reduce((s, x) => s + x.valorUnitario * x.quantidade, 0);
    const custoTotal = custoServicos + custoPecas;
    const vendaTotal = vendaServicos + vendaPecas;
    return { custoTotal, vendaTotal, lucro: vendaTotal - custoTotal };
  }, [servicos, pecas]);

  const maiorGarantia = useMemo(
    () => servicos.reduce((max, s) => Math.max(max, s.prazoGarantiaDias), 0),
    [servicos],
  );

  const reset = () => {
    setClienteId(""); setClienteNome(""); setClienteTel(""); setClienteDoc("");
    setTipo("Smartphone"); setMarca(""); setModelo(""); setSerie(""); setSenha(""); setAcessorios("");
    setDefeito(""); setObs("");
    setChecklist(CHECKLIST_PADRAO.map((c) => ({ ...c, estado: "nao_testado" as ChecklistEstado })));
    setServicos([]); setPecas([]); setPrioridade("media"); setTecnicoId("");
  };

  const handleSalvar = async () => {
    if (!clienteNome.trim()) return toast.error("Informe o cliente");
    if (!marca.trim() || !modelo.trim()) return toast.error("Informe marca e modelo do equipamento");
    if (!defeito.trim()) return toast.error("Descreva o defeito relatado");

    const tecnico = tecnicos.find((t) => t.id === tecnicoId);
    const modeloMatch = equipamentosModelos.find((m) => {
      const nameOk = m.name.trim().toLowerCase() === modelo.trim().toLowerCase();
      const brandOk = !marca.trim() || m.brand.trim().toLowerCase() === marca.trim().toLowerCase();
      return nameOk && brandOk;
    });
    const prazoMs = 24 * 3600 * 1000 * 2;
    const termoConsolidado = servicos.map((s) => `▸ ${s.nome} (${s.prazoGarantiaDias} dias)\n${s.termoGarantia}`).join("\n\n---\n\n");

    const novaOS: Omit<OrdemServico, "id" | "codigo" | "criadoEm" | "atualizadoEm" | "timeline"> = {
      storeId,
      clienteId: clienteId || `c_tmp_${Date.now()}`,
      cliente: {
        id: clienteId || `c_tmp_${Date.now()}`,
        nome: clienteNome,
        telefone: clienteTel || undefined,
        whatsapp: clienteTel || undefined,
        documento: clienteDoc || undefined,
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
      pecas: pecas.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku, quantidade: p.quantidade, valorUnitario: p.valorUnitario })),
      observacoes: obs ? [{ id: `ob_${Date.now()}`, autor: "Você", conteudo: obs, interna: true, criadoEm: new Date().toISOString() }] : [],
      anexos: [],
      garantia: maiorGarantia > 0
        ? { ativa: false, prazoDias: maiorGarantia, termo: termoConsolidado }
        : { ativa: false },
      checklist,
      senhaEquipamento: senha || undefined,
      observacaoCliente: undefined,
      servicosCatalogo: servicos.map((s) => ({
        servicoId: s.servicoId,
        descricao: s.nome,
        custoInterno: s.custoInterno,
        valorVenda: s.valorVenda,
        prazoGarantiaDias: s.prazoGarantiaDias,
        termoGarantia: s.termoGarantia,
      })),
    };

    try {
      const criada = await criarOS(novaOS);
      toast.success(`${criada.codigo} criada com sucesso`);
      onOpenChange(false);
      reset();
      navigate(`/operacoes/os/${criada.id}`);
    } catch {
      toast.error("Falha ao criar OS");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2 block">Selecionar cliente existente</Label>
                <Select value={clienteId} onValueChange={onPickCliente}>
                  <SelectTrigger className="h-12 bg-background/50 border-border/60 transition-colors hover:border-primary/40 focus:ring-primary/20 text-base">
                    <SelectValue placeholder="Buscar no CRM..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="py-2">
                        {c.nome} {c.telefone ? `· ${c.telefone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-4 border-t border-border/40">
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Nome *</Label>
                  <div className="relative flex items-center">
                    <User className="absolute left-3.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
                    <Input className="h-12 !pl-11 bg-background/50 border-border/60 focus-visible:ring-primary/20 transition-all text-base" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} maxLength={120} placeholder="Nome do cliente" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Telefone / WhatsApp</Label>
                  <div className="relative flex items-center">
                    <Phone className="absolute left-3.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
                    <Input className="h-12 !pl-11 bg-background/50 border-border/60 focus-visible:ring-primary/20 transition-all text-base" value={clienteTel} onChange={(e) => setClienteTel(e.target.value)} maxLength={20} placeholder="(11) 99999-0000" />
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">CPF / CNPJ</Label>
                  <div className="relative flex items-center">
                    <FileText className="absolute left-3.5 h-5 w-5 text-muted-foreground/50 pointer-events-none" />
                    <Input className="h-12 !pl-11 bg-background/50 border-border/60 focus-visible:ring-primary/20 transition-all text-base" value={clienteDoc} onChange={(e) => setClienteDoc(e.target.value)} maxLength={20} placeholder="000.000.000-00" />
                  </div>
                </div>
              </div>
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
                      <SelectTrigger className="h-12 bg-background/50 border-border/60 transition-colors focus:ring-primary/20 text-base"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Smartphone", "Notebook", "Tablet", "Impressora", "Console", "Outro"].map((t) => (
                          <SelectItem key={t} value={t} className="py-2">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Marca *</Label>
                    <Input className="h-12 bg-background/50 border-border/60 focus-visible:ring-primary/20 text-base" value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={40} list="og_operacoes_marcas" placeholder="Ex: Apple, Samsung..." />
                    <datalist id="og_operacoes_marcas">{Array.from(new Set(equipamentosModelos.map((m) => m.brand).filter(Boolean))).map((b) => <option key={b} value={b} />)}</datalist>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Modelo *</Label>
                    <Input className="h-12 bg-background/50 border-border/60 focus-visible:ring-primary/20 text-base" value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={60} list="og_operacoes_modelos" placeholder="Ex: iPhone 13 Pro" />
                    <datalist id="og_operacoes_modelos">{equipamentosModelos.filter((m) => !marca.trim() || m.brand.toLowerCase() === marca.trim().toLowerCase()).map((m) => <option key={m.id} value={m.name} />)}</datalist>
                  </div>
                  <div className="space-y-2"><Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">IMEI / Nº de série</Label><Input className="h-12 bg-background/50 border-border/60 focus-visible:ring-primary/20 text-base" value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={40} /></div>
                  <div className="space-y-2"><Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Senha (opcional)</Label><Input className="h-12 bg-background/50 border-border/60 focus-visible:ring-primary/20 text-base" value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={40} placeholder="Padrão, biometria, etc." /></div>
                  <div className="space-y-2"><Label className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Acessórios entregues</Label><Input className="h-12 bg-background/50 border-border/60 focus-visible:ring-primary/20 text-base" value={acessorios} onChange={(e) => setAcessorios(e.target.value)} maxLength={120} placeholder="Carregador, capa, cabo..." /></div>
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
                  <p className="text-xs text-muted-foreground mt-0.5">Marque o estado de cada componente do aparelho ao recebê-lo do cliente.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {checklist.map((item, idx) => (
                  <div key={item.id} className="flex flex-col justify-between rounded-xl border border-border/60 bg-background/50 p-4 transition-all hover:border-primary/30 hover:shadow-md">
                    <span className="text-sm font-semibold tracking-tight mb-3">{item.label}</span>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/30 rounded-lg">
                      {ESTADOS.map((e) => {
                        const isSelected = item.estado === e.value;
                        const Icon = e.icon;
                        return (
                          <button
                            key={e.value}
                            type="button"
                            onClick={() => setChecklist((prev) => prev.map((it, i) => i === idx ? { ...it, estado: e.value } : it))}
                            className={cn(
                              "flex flex-col items-center justify-center py-2 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all duration-300",
                              isSelected ? e.cls : "text-muted-foreground hover:bg-background/80 hover:shadow-sm"
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
                <Select value="" onValueChange={(id) => { const s = servicosCatalogo.find((x) => x.id === id); if (s) addServico(s); }}>
                  <SelectTrigger className="h-11 bg-background/50 border-border/60 focus:ring-primary/20"><SelectValue placeholder="Adicionar serviço do catálogo..." /></SelectTrigger>
                  <SelectContent>
                    {servicosCatalogo.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome} · {brl(s.valorVenda)} · garantia {s.prazoGarantiaDias}d</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {servicos.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {servicos.map((s, i) => (
                      <div key={s.servicoId} className="group flex items-center justify-between rounded-lg border border-border/60 bg-background/50 p-3 hover:border-primary/30 transition-all">
                        <div>
                          <div className="text-sm font-semibold">{s.nome}</div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><CheckCircle2 className="h-3 w-3" /> Garantia: {s.prazoGarantiaDias} dias</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-foreground">{brl(s.valorVenda)}</span>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-500/10 transition-all" onClick={() => setServicos((p) => p.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Peças */}
              <div className="bg-card/40 border border-border/50 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-foreground/80 flex items-center gap-2 border-b border-border/40 pb-3">
                  <Plus className="h-4 w-4 text-primary" /> Peças utilizadas
                </h3>
                <Select value="" onValueChange={(id) => { const p = pecasEstoque.find((x) => x.id === id); if (p) addPeca(p); }}>
                  <SelectTrigger className="h-11 bg-background/50 border-border/60 focus:ring-primary/20"><SelectValue placeholder="Adicionar peça do estoque..." /></SelectTrigger>
                  <SelectContent>
                    {pecasEstoque.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={p.estoqueAtual <= 0}>{p.nome} · {brl(p.precoVenda)} · estoque: {p.estoqueAtual}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pecas.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {pecas.map((p, i) => (
                      <div key={p.id} className="group flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 p-3 hover:border-primary/30 transition-all">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{p.nome}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{p.sku || "Sem SKU"}</div>
                        </div>
                        <Input type="number" min={1} className="w-16 h-8 text-center bg-background/50" value={p.quantidade} onChange={(e) => setPecas((prev) => prev.map((x, idx) => idx === i ? { ...x, quantidade: Math.max(1, Number(e.target.value)) } : x))} />
                        <span className="w-20 text-right text-sm font-bold text-foreground">{brl(p.valorUnitario * p.quantidade)}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-rose-500 hover:bg-rose-500/10 transition-all" onClick={() => setPecas((prev) => prev.filter((_, idx) => idx !== i))}>
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
              <div className={cn("relative overflow-hidden rounded-xl border border-border/50 p-5 shadow-sm", totais.lucro >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20")}>
                <div className={cn("absolute -right-4 -top-4 opacity-5", totais.lucro >= 0 ? "text-emerald-500" : "text-rose-500")}><DollarSign className="h-24 w-24" /></div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Lucro Estimado</div>
                <div className={cn("text-2xl font-display font-bold", totais.lucro >= 0 ? "text-emerald-600" : "text-rose-600")}>{brl(totais.lucro)}</div>
              </div>
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
                      {tecnicos.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.nome} {t.online ? "· online" : ""}</SelectItem>
                      ))}
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

        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/20">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-rose-500/10 hover:text-rose-500 transition-colors">Cancelar</Button>
          <Button onClick={handleSalvar} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)] transition-all">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Criar Ordem de Serviço
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
