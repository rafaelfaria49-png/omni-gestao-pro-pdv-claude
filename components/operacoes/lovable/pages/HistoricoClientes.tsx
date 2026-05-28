import { useMemo, useState } from "react";
import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { useOS } from "@/store/osStore";
import { Input } from "@/components/ui/input";
import { Search, Phone, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { brl, dt, totalOrcamento } from "@/lib/os/format";

const normPhone = (p?: string) => (p ?? "").replace(/\D/g, "");

export default function HistoricoClientes() {
  const { ordens, clientes } = useOS();
  const [q, setQ] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clientes.filter((c) => !s || c.nome.toLowerCase().includes(s) || (c.telefone ?? "").includes(s));
  }, [clientes, q]);

  const cliente = clientes.find((c) => c.id === selecionado);

  /** Matches OS to a cliente using UUID → phone → name cascade (handles legacy seed IDs). */
  const ordensParaCliente = useMemo(() => {
    const byId = new Map<string, typeof ordens>();
    for (const c of clientes) {
      const fone = normPhone(c.telefone);
      const nome = (c.nome ?? "").toLowerCase().trim();
      const lista = ordens.filter((o) => {
        if (o.clienteId === c.id) return true;
        const snapFone = normPhone(o.cliente?.telefone);
        if (fone && snapFone && fone === snapFone) return true;
        const snapNome = (o.cliente?.nome ?? "").toLowerCase().trim();
        if (nome && snapNome && nome === snapNome) return true;
        return false;
      });
      byId.set(c.id, lista);
    }
    return byId;
  }, [ordens, clientes]);

  const osCliente = useMemo(() => {
    if (!selecionado) return [];
    return (ordensParaCliente.get(selecionado) ?? []).slice().sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  }, [ordensParaCliente, selecionado]);
  const totalGasto = osCliente.reduce((s, o) => s + (o.orcamento?.total ?? totalOrcamento(o)), 0);

  return (
    <OperacoesLayout>
      <div className="flex-1 flex flex-col min-h-0 h-full w-full overflow-hidden">
        <div className="mb-5 flex-none">
          <h1 className="text-xl font-semibold tracking-tight">Histórico de clientes</h1>
          <p className="text-sm text-muted-foreground">Timeline completa de atendimentos por cliente</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr] flex-1 min-h-0 h-full overflow-hidden pb-1">
          <div className="rounded-xl border border-border bg-card p-3 flex flex-col overflow-hidden h-full">
            <div className="relative mb-3 flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="Buscar por nome ou telefone" className="pl-9" />
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto scroll-elegant min-h-0">
              {filtrados.map((c) => {
                const ativo = c.id === selecionado;
                const qtd = (ordensParaCliente.get(c.id) ?? []).length;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelecionado(c.id)}
                    className={`flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${ativo ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted"}`}
                  >
                    <span className="text-sm font-medium">{c.nome}</span>
                    <span className="text-[11px] text-muted-foreground">{c.telefone ?? "—"} · {qtd} OS</span>
                  </button>
                );
              })}
              {filtrados.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">Nenhum cliente encontrado</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 flex flex-col overflow-hidden h-full">
            {!cliente ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center my-auto">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                  <Search className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <h3 className="mt-4 text-sm font-semibold tracking-tight text-foreground">Nenhum cliente selecionado</h3>
                <p className="mt-1 text-xs text-muted-foreground">Busque e selecione um cliente ao lado para ver o histórico de OS.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 flex-none pb-4 border-b border-border/50">
                  <div>
                    <h2 className="text-lg font-semibold">{cliente.nome}</h2>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      {cliente.telefone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {cliente.telefone}</span>}
                      {cliente.documento && <span>{cliente.documento}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase text-muted-foreground">Total investido</div>
                    <div className="text-xl font-semibold">{brl(totalGasto)}</div>
                    <div className="text-[11px] text-muted-foreground">{osCliente.length} OS no histórico</div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto scroll-elegant min-h-0 mt-5 space-y-3 pr-1">
                  {osCliente.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
                        <FileText className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <h4 className="mt-3 text-sm font-semibold tracking-tight text-foreground">Sem ordens de serviço</h4>
                      <p className="mt-1 text-xs text-muted-foreground">Este cliente ainda não possui OS registradas no histórico.</p>
                    </div>
                  )}
                  {osCliente.map((o) => (
                    <Link
                      key={o.id}
                      to={`/operacoes/os/${o.id}`}
                      className="block rounded-lg border border-border bg-background/60 p-3 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-muted-foreground">{o.codigo}</div>
                          <div className="truncate text-sm font-medium">{o.equipamento.marca} {o.equipamento.modelo}</div>
                          <div className="line-clamp-1 text-xs text-muted-foreground">{o.equipamento.defeitoRelatado}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{brl(o.orcamento?.total ?? totalOrcamento(o))}</div>
                          <div className="text-[11px] text-muted-foreground">{dt(o.criadoEm)}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </OperacoesLayout>
  );
}
