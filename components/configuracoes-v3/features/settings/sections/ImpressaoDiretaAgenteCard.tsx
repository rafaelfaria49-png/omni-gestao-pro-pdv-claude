"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsCard } from "../components/SettingsCard";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Switch } from "@/components/configuracoes-v3/components/ui/switch";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { listTerminais } from "@/app/actions/terminais";
import { directPrintClient, directPrintErrorMessage, type AdminBinding, type AdminInstallation } from "@/lib/printing/direct/client";

type Loaded = { installations: AdminInstallation[]; bindings: AdminBinding[] };
type Terminal = { id: string; code: string; name: string };

/**
 * OMNI-PRINT-004C (candidato). Pareamento do agente local, vínculo terminal → impressora e chave da loja.
 * Fica oculto para quem não configura a loja e mostra "indisponível" enquanto o gate do servidor estiver fechado.
 */
export function ImpressaoDiretaAgenteCard() {
  const { lojaAtivaId } = useLojaAtiva();
  const storeId = lojaAtivaId?.trim() || "";
  const { impressaoConfig, refresh } = useStoreSettings();
  const { toast } = useToast();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "hidden" } | { kind: "ready"; data: Loaded }>({ kind: "loading" });
  const [restrict, setRestrict] = useState(true);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [label, setLabel] = useState("Computador do caixa");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, { installationId: string; printerName: string; profileId: string }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    const r = await directPrintClient.adminList(storeId);
    // Gate closed (404), no permission or failure: the card stays hidden — nothing changes for the store (P3-9).
    if (!r.ok) { setState({ kind: "hidden" }); return; }
    setState({ kind: "ready", data: r.value });
    const t = await listTerminais(storeId).catch(() => []);
    setTerminals((t as Terminal[]).map(x => ({ id: x.id, code: x.code, name: x.name })));
  }, [storeId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const r = await directPrintClient.adminAction<Record<string, unknown>>(storeId, body);
    setBusy(false);
    if (!r.ok) { toast({ title: "Não foi possível concluir", description: directPrintErrorMessage(r.error), variant: "destructive" }); return null; }
    toast({ title: ok });
    await load();
    return r.value;
  };
  const setStoreFlag = async (value: boolean) => {
    setBusy(true);
    const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/settings`, { method: "PUT", credentials: "include",
      headers: { [ASSISTEC_LOJA_HEADER]: storeId, "Content-Type": "application/json" },
      body: JSON.stringify({ printerConfig: { impressao: { impressaoDireta: value } } }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { toast({ title: "Falha ao salvar", variant: "destructive" }); return; }
    await refresh().catch(() => {});
  };

  if (state.kind === "loading" || state.kind === "hidden") return null;
  const { installations, bindings } = state.data;
  const usable = installations.filter(i => i.paired && !i.revoked);
  return (
    <SettingsCard title="Impressão direta pelo agente local"
      description="Envia o comprovante da venda confirmada à impressora do caixa, sem janela do navegador. O aceite da fila não confirma que o papel saiu.">
      <div className="min-w-0 space-y-6 p-4 sm:p-6">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="impressao-direta-switch">Usar impressão direta nesta loja</Label>
            <p className="text-xs text-muted-foreground">Vale para os terminais com impressora vinculada abaixo. Desligado por padrão.</p>
          </div>
          <Switch id="impressao-direta-switch" checked={impressaoConfig.impressaoDireta} disabled={busy} onCheckedChange={(v) => void setStoreFlag(v)} />
        </div>

        <section className="min-w-0 space-y-3" aria-label="Computadores pareados">
          <h4 className="text-sm font-semibold text-foreground">Computadores do caixa</h4>
          {installations.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agente pareado.</p>}
          <ul className="divide-y divide-border">
            {installations.map(i => (
              <li key={i.installationId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{i.label}</span>{" "}
                  <span className="text-muted-foreground">
                    {i.revoked ? "· revogado" : !i.paired ? (i.pairingPending ? "· aguardando pareamento" : "· código expirado") : i.online ? "· online" : "· offline"}
                    {i.paired && !i.revoked ? ` · ${i.printers.length} impressora(s)` : ""}
                  </span>
                </span>
                {!i.revoked && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "revokeInstallation", installationId: i.installationId }, "Agente revogado")}>Revogar</Button>}
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="agente-label">Nome do computador</Label>
              <Input id="agente-label" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} />
            </div>
            <Button type="button" disabled={busy || !label.trim()} onClick={async () => {
              const v = await act({ action: "createInstallation", label: label.trim() }, "Código de pareamento gerado");
              if (v) setPairing({ code: String(v.pairingCode), expiresAt: String(v.pairingExpiresAt) });
            }}>Gerar código de pareamento</Button>
          </div>
          {pairing && (
            <div className="min-w-0 rounded-lg border border-border bg-muted/40 p-3 text-sm" role="status">
              <p className="font-mono text-lg font-semibold tracking-widest text-foreground">{pairing.code}</p>
              <p className="text-xs text-muted-foreground">Válido até {new Date(pairing.expiresAt).toLocaleTimeString("pt-BR")}, uso único. No computador do caixa:</p>
              <code className="mt-1 block break-all text-xs text-foreground">node agent.mjs pair --server {typeof window !== "undefined" ? window.location.origin : ""} --code {pairing.code}</code>
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-3" aria-label="Impressora por terminal">
          <h4 className="text-sm font-semibold text-foreground">Impressora por terminal</h4>
          <label className="flex min-w-0 items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-1" checked={restrict} onChange={e => setRestrict(e.target.checked)} />
            <span className="min-w-0">Somente este navegador pode imprimir no terminal vinculado
              <span className="block text-xs text-muted-foreground">Faça o vínculo a partir do computador do caixa. Outros navegadores recebem recusa clara.</span></span>
          </label>
          {terminals.length === 0 && <p className="text-sm text-muted-foreground">Nenhum terminal cadastrado.</p>}
          <ul className="divide-y divide-border">
            {terminals.map(t => {
              const bound = bindings.find(b => b.terminalId === t.id);
              const d = draft[t.id] ?? { installationId: usable[0]?.installationId ?? "", printerName: "", profileId: "THERMAL_80" };
              const printers = usable.find(i => i.installationId === d.installationId)?.printers ?? [];
              return (
                <li key={t.id} className="min-w-0 space-y-2 py-3 text-sm">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{t.name || t.code}</span>
                    <span className="text-muted-foreground">{bound ? `${bound.printerName} · ${bound.profileId === "THERMAL_58" ? "58 mm" : "80 mm"}${bound.restrictedToBrowser ? " · navegador autorizado" : ""}` : "Sem impressora vinculada"}</span>
                  </div>
                  {usable.length > 0 && (
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <select aria-label={`Computador do ${t.code}`} className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-foreground" value={d.installationId}
                        onChange={e => setDraft({ ...draft, [t.id]: { ...d, installationId: e.target.value, printerName: "" } })}>
                        {usable.map(i => <option key={i.installationId} value={i.installationId}>{i.label}</option>)}
                      </select>
                      <select aria-label={`Impressora do ${t.code}`} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-foreground" value={d.printerName}
                        onChange={e => setDraft({ ...draft, [t.id]: { ...d, printerName: e.target.value } })}>
                        <option value="">Escolha a impressora…</option>
                        {printers.map(p => <option key={p.name} value={p.name}>{p.name}{p.online ? "" : " (offline)"}</option>)}
                      </select>
                      <select aria-label={`Bobina do ${t.code}`} className="h-9 rounded-md border border-border bg-background px-2 text-foreground" value={d.profileId}
                        onChange={e => setDraft({ ...draft, [t.id]: { ...d, profileId: e.target.value } })}>
                        <option value="THERMAL_80">80 mm</option>
                        <option value="THERMAL_58">58 mm</option>
                      </select>
                      <Button type="button" size="sm" disabled={busy || !d.printerName} onClick={() => void act({ action: "bindTerminal", terminalId: t.id, ...d, restrictToThisBrowser: restrict }, "Impressora vinculada")}>Vincular</Button>
                      {bound && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: "revokeBinding", terminalId: t.id }, "Vínculo removido")}>Desvincular</Button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </SettingsCard>
  );
}
