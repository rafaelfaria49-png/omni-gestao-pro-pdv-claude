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
import { Trash2, Plus } from "lucide-react";
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

const ESTADOS: { value: ChecklistEstado; label: string; cls: string }[] = [
  { value: "ok", label: "OK", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  { value: "ruim", label: "Ruim", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  { value: "nao_testado", label: "N/T", cls: "bg-muted text-muted-foreground border-border" },
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
      <DialogContent className="w-[92vw] max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="cliente" className="mt-2">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="cliente">Cliente</TabsTrigger>
            <TabsTrigger value="equipamento">Equipamento</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="servicos">Serviços / Peças</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          </TabsList>

          {/* CLIENTE */}
          <TabsContent value="cliente" className="space-y-4 pt-4">
            <div>
              <Label>Selecionar cliente existente</Label>
              <Select value={clienteId} onValueChange={onPickCliente}>
                <SelectTrigger><SelectValue placeholder="Buscar no CRM..." /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {c.telefone ? `· ${c.telefone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><Label>Nome *</Label><Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} maxLength={120} /></div>
              <div><Label>Telefone / WhatsApp</Label><Input value={clienteTel} onChange={(e) => setClienteTel(e.target.value)} maxLength={20} placeholder="(11) 99999-0000" /></div>
              <div className="md:col-span-2"><Label>CPF / CNPJ</Label><Input value={clienteDoc} onChange={(e) => setClienteDoc(e.target.value)} maxLength={20} /></div>
            </div>
          </TabsContent>

          {/* EQUIPAMENTO */}
          <TabsContent value="equipamento" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Smartphone", "Notebook", "Tablet", "Impressora", "Console", "Outro"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Marca *</Label>
                <Input
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  maxLength={40}
                  list="og_operacoes_marcas"
                />
                <datalist id="og_operacoes_marcas">
                  {Array.from(new Set(equipamentosModelos.map((m) => m.brand).filter(Boolean))).map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>Modelo *</Label>
                <Input
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  maxLength={60}
                  list="og_operacoes_modelos"
                />
                <datalist id="og_operacoes_modelos">
                  {equipamentosModelos
                    .filter((m) => !marca.trim() || m.brand.toLowerCase() === marca.trim().toLowerCase())
                    .map((m) => (
                      <option key={m.id} value={m.name} />
                    ))}
                </datalist>
              </div>
              <div><Label>IMEI / Nº de série</Label><Input value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={40} /></div>
              <div><Label>Senha (opcional)</Label><Input value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={40} placeholder="Padrão, biometria, etc." /></div>
              <div><Label>Acessórios entregues</Label><Input value={acessorios} onChange={(e) => setAcessorios(e.target.value)} maxLength={120} placeholder="Carregador, capa, cabo..." /></div>
            </div>
            <div>
              <Label>Defeito relatado *</Label>
              <Textarea value={defeito} onChange={(e) => setDefeito(e.target.value)} maxLength={1000} rows={3} />
            </div>
            <div>
              <Label>Observações internas</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} rows={2} placeholder="Visível apenas para a equipe técnica" />
            </div>
          </TabsContent>

          {/* CHECKLIST */}
          <TabsContent value="checklist" className="pt-4">
            <p className="mb-3 text-xs text-muted-foreground">Marque o estado de cada item conforme inspeção visual na entrada.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {checklist.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <span className="text-sm font-medium">{item.label}</span>
                  <div className="flex gap-1">
                    {ESTADOS.map((e) => (
                      <button
                        key={e.value}
                        type="button"
                        onClick={() => setChecklist((prev) => prev.map((it, i) => i === idx ? { ...it, estado: e.value } : it))}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          item.estado === e.value ? e.cls : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* SERVIÇOS / PEÇAS */}
          <TabsContent value="servicos" className="space-y-5 pt-4">
            <div>
              <Label>Adicionar serviço do catálogo</Label>
              <Select value="" onValueChange={(id) => { const s = servicosCatalogo.find((x) => x.id === id); if (s) addServico(s); }}>
                <SelectTrigger><SelectValue placeholder="Selecione um serviço..." /></SelectTrigger>
                <SelectContent>
                  {servicosCatalogo.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome} · {brl(s.valorVenda)} · garantia {s.prazoGarantiaDias}d
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {servicos.length > 0 && (
                <div className="mt-3 space-y-2">
                  {servicos.map((s, i) => (
                    <div key={s.servicoId} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                      <div>
                        <div className="text-sm font-medium">{s.nome}</div>
                        <div className="text-[11px] text-muted-foreground">Garantia automática: {s.prazoGarantiaDias} dias</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">{brl(s.valorVenda)}</span>
                        <Button size="icon" variant="ghost" onClick={() => setServicos((p) => p.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Adicionar peça do estoque</Label>
              <Select value="" onValueChange={(id) => { const p = pecasEstoque.find((x) => x.id === id); if (p) addPeca(p); }}>
                <SelectTrigger><SelectValue placeholder="Selecione uma peça..." /></SelectTrigger>
                <SelectContent>
                  {pecasEstoque.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={p.estoqueAtual <= 0}>
                      {p.nome} · {brl(p.precoVenda)} · estoque: {p.estoqueAtual}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pecas.length > 0 && (
                <div className="mt-3 space-y-2">
                  {pecas.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.nome}</div>
                        <div className="text-[11px] text-muted-foreground">{p.sku}</div>
                      </div>
                      <Input
                        type="number" min={1} className="w-20"
                        value={p.quantidade}
                        onChange={(e) => setPecas((prev) => prev.map((x, idx) => idx === i ? { ...x, quantidade: Math.max(1, Number(e.target.value)) } : x))}
                      />
                      <span className="w-24 text-right text-sm font-semibold">{brl(p.valorUnitario * p.quantidade)}</span>
                      <Button size="icon" variant="ghost" onClick={() => setPecas((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* FINANCEIRO */}
          <TabsContent value="financeiro" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo total (interno)</div>
                <div className="mt-1 text-xl font-semibold text-amber-600">{brl(totais.custoTotal)}</div>
                <Badge variant="outline" className="mt-2 text-[10px]">Oculto do cliente</Badge>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total ao cliente</div>
                <div className="mt-1 text-xl font-semibold text-foreground">{brl(totais.vendaTotal)}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Lucro estimado</div>
                <div className={cn("mt-1 text-xl font-semibold", totais.lucro >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {brl(totais.lucro)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>Prioridade</Label>
                <Select value={prioridade} onValueChange={(v) => setPrioridade(v as OSPrioridade)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="critica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Técnico responsável</Label>
                <Select value={tecnicoId} onValueChange={setTecnicoId}>
                  <SelectTrigger><SelectValue placeholder="Atribuir depois" /></SelectTrigger>
                  <SelectContent>
                    {tecnicos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nome} {t.online ? "· online" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {maiorGarantia > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
                <Plus className="mr-1 inline h-3 w-3" />
                Garantia automática consolidada: {maiorGarantia} dias (maior prazo entre os serviços selecionados).
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar}>Criar OS</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
