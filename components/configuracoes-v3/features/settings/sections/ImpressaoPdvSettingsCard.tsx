"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Printer } from "lucide-react";
import { SettingsCard } from "../components/SettingsCard";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Switch } from "@/components/configuracoes-v3/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/configuracoes-v3/components/ui/select";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import {
  defaultPdvImpressaoConfig,
  type PdvImpressaoConfig,
} from "@/lib/pdv-impressao-config";
import { buildPdvReceiptEscPos } from "@/lib/escpos";
import { sendEscPosViaProxy } from "@/lib/thermal-print";
import { printPdvSaleReceipt } from "@/lib/pdv-print-runtime";
import { configPadrao } from "@/lib/config-empresa";
import { changedFields } from "./settings-patch";

/**
 * Preferências consumidas pela impressão do navegador (`openBrowserFallback`/HTML).
 * "Imprimir automaticamente" fica de fora: o PDV usa a ponte interna sem fallback
 * (`allowBrowserFallback: false`), então para a loja ele não imprimiria; o valor gravado
 * é preservado.
 */
const BROWSER_SWITCHES = [
  ["logoNoCupom", "Exibir logo no cupom", "Usa a logo da unidade quando disponível"],
] as const;

const PLATFORM_SWITCHES = [
  ["abrirGaveta", "Abrir gaveta após impressão", "Pulso ESC/POS na gaveta de dinheiro"],
  ["imprimirAutomatico", "Imprimir cupom automaticamente", "Após confirmar pagamento no PDV"],
  ["logoNoCupom", "Exibir logo no cupom (HTML)", "Usa logoUrl da unidade quando disponível"],
  ["imprimirOs", "Permitir impressão térmica de OS", "Ordens de serviço no módulo Operações"],
  ["imprimirCrediario", "Permitir recibo de crediário", "Baixas em Contas a Receber"],
] as const;

function normalizeImpressao(form: PdvImpressaoConfig): PdvImpressaoConfig {
  return {
    ...form,
    impressoraHost: form.impressoraHost.trim(),
    impressoraPorta: Math.min(65535, Math.max(1, Math.round(form.impressoraPorta) || 9100)),
    rodapeCupom: form.rodapeCupom.trim(),
    viasCupom: Math.min(5, Math.max(1, Math.round(form.viasCupom) || 1)),
  };
}

/**
 * `browserOnly`: experiência do cliente. Mostra só o que o caminho permitido (impressão
 * pelo navegador) consome. Host/porta, vias ESC/POS, gaveta e testes TCP dependem da
 * ponte interna `/api/print/raw` e continuam exclusivos da plataforma; seus valores
 * gravados nunca são reenviados a partir desta tela.
 */
export function ImpressaoPdvSettingsCard({ browserOnly = false }: { browserOnly?: boolean }) {
  const { toast } = useToast();
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva();
  const { hydrated, settings, impressaoConfig, refresh } = useStoreSettings();

  const [form, setForm] = useState<PdvImpressaoConfig>(() => defaultPdvImpressaoConfig());
  const [snapshot, setSnapshot] = useState<PdvImpressaoConfig>(() => defaultPdvImpressaoConfig());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const dirty = useMemo(() => changedFields(snapshot, form) !== null, [form, snapshot]);
  const dirtyRef = useRef(false);

  // Revalidação do provider não substitui um rascunho em andamento.
  useEffect(() => {
    if (!hydrated || dirtyRef.current) return;
    setForm(impressaoConfig);
    setSnapshot(impressaoConfig);
  }, [hydrated, impressaoConfig, lojaAtivaId]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const noLoja = !lojaAtivaId?.trim();
  const busy = !hydrated || saving;

  const patch = <K extends keyof PdvImpressaoConfig>(key: K, value: PdvImpressaoConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancel = () => setForm(snapshot);

  const handleSave = async () => {
    const lojaHeader = lojaAtivaId?.trim();
    if (!lojaHeader) {
      toast({
        title: "Nenhuma unidade ativa",
        description: "Selecione a unidade ativa e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    // Primeiro o que foi editado; só esses campos são normalizados e enviados.
    const edited = changedFields(snapshot, form);
    if (!edited) {
      setForm(snapshot);
      return;
    }
    const normalized = normalizeImpressao(form);
    const changes = Object.fromEntries(
      (Object.keys(edited) as Array<keyof PdvImpressaoConfig>).map((key) => [key, normalized[key]]),
    ) as Partial<PdvImpressaoConfig>;
    const impressao: PdvImpressaoConfig = { ...snapshot, ...changes };

    setSaving(true);
    try {
      // Só as chaves alteradas: o merge do servidor funde `impressao` sob o lock da loja.
      const res = await fetch(`/api/stores/${encodeURIComponent(lojaHeader)}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          printerConfig: { impressao: changes },
          // Rodapé geral só acompanha uma alteração explícita e não vazia do rodapé do cupom.
          ...(changes.rodapeCupom ? { receiptFooter: changes.rodapeCupom } : {}),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Falha ao salvar (HTTP ${res.status})`);
      }

      await refresh().catch(() => {});
      setForm(impressao);
      setSnapshot(impressao);
      toast({
        title: "Impressão salva",
        description: "O PDV desta unidade passará a usar estas preferências.",
      });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      const bytes = buildPdvReceiptEscPos(
        {
          nomeFantasia: configPadrao.empresa.nomeFantasia,
          cnpj: configPadrao.empresa.cnpj,
          itens: [{ name: "Teste de impressão", quantity: 1, unitPrice: 1, lineTotal: 1 }],
          subtotal: 1,
          taxes: 0,
          discount: 0,
          total: 1,
          dataHora: new Date().toLocaleString("pt-BR"),
          receiptFooter: form.rodapeCupom.trim() || "Teste OmniGestão — configurações PDV",
        },
        { modo: form.comprovanteModo, maxChars: form.bobinaTamanho === "58mm" ? 32 : 48 },
      );
      const host = form.impressoraHost.trim();
      const res = await sendEscPosViaProxy(
        bytes,
        host ? { host, port: form.impressoraPorta } : undefined,
      );
      if (res.ok) {
        toast({ title: "Teste enviado", description: "Cupom de teste enviado à impressora (TCP/raw)." });
      } else {
        toast({
          title: "Impressora indisponível",
          description: `${res.error} — verifique host/porta ou THERMAL_PRINT_HOST no servidor.`,
          variant: "destructive",
        });
      }
    } finally {
      setTesting(false);
    }
  };

  /** Prévia explícita pelo mesmo HTML do cupom; não chama a ponte TCP nem grava venda. */
  const handleBrowserPreview = async () => {
    const result = await printPdvSaleReceipt({
      config: normalizeImpressao(form),
      receiptFooter: settings?.receiptFooter ?? null,
      logoUrl: lojaAtivaRaw?.logoUrl ?? null,
      forceBrowserFallback: true,
      input: {
        nomeFantasia: lojaAtivaRaw?.nomeFantasia?.trim() || "Sua loja",
        cnpj: lojaAtivaRaw?.cnpj?.trim() || "—",
        itens: [{ name: "PRÉVIA — sem valor fiscal", quantity: 1, unitPrice: 0, lineTotal: 0 }],
        subtotal: 0,
        taxes: 0,
        discount: 0,
        total: 0,
        dataHora: new Date().toLocaleString("pt-BR"),
      },
    });
    if (!result.ok) {
      toast({ title: "Prévia indisponível", description: result.error, variant: "destructive" });
    }
  };

  const switches = browserOnly ? BROWSER_SWITCHES : PLATFORM_SWITCHES;

  return (
    <SettingsCard
      title={browserOnly ? "Impressão do cupom" : "Impressão operacional"}
      description={browserOnly
        ? "O cupom é impresso pela impressão do navegador do computador do caixa. Estas preferências valem para esta unidade."
        : "Preferências da estação/unidade consumidas pelo PDV, OS e crediário. O cupom usa ESC/POS pela API /api/print/raw (TCP 9100 ou bridge HTTP)."}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {!browserOnly ? (
          <>
            <div className="space-y-2 min-w-0 sm:col-span-2">
              <Label htmlFor="imp-host">Impressora de comprovante (host/IP)</Label>
              <Input
                id="imp-host"
                placeholder="Ex.: 192.168.0.50 ou deixe vazio para THERMAL_PRINT_HOST do servidor"
                value={form.impressoraHost}
                onChange={(e) => patch("impressoraHost", e.target.value)}
                disabled={busy || noLoja}
              />
              <p className="text-xs text-muted-foreground">
                Porta raw padrão 9100. Com host configurado, o caixa envia direto para esta térmica; o navegador só é aberto quando o operador escolhe o fallback.
              </p>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="imp-port">Porta TCP</Label>
              <Input
                id="imp-port"
                type="number"
                min={1}
                max={65535}
                value={form.impressoraPorta}
                onChange={(e) => patch("impressoraPorta", Number(e.target.value) || 9100)}
                disabled={busy || noLoja}
              />
            </div>
          </>
        ) : null}

        <div className="space-y-2 min-w-0">
          <Label id="imp-bobina-label">Bobina</Label>
          <Select
            value={form.bobinaTamanho}
            onValueChange={(v) => patch("bobinaTamanho", v === "58mm" ? "58mm" : "80mm")}
            disabled={busy || noLoja}
          >
            <SelectTrigger aria-labelledby="imp-bobina-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="80mm">80 mm (padrão)</SelectItem>
              <SelectItem value="58mm">58 mm</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 min-w-0">
          <Label id="imp-modo-label">Comprovante</Label>
          <Select
            value={form.comprovanteModo}
            onValueChange={(v) =>
              patch("comprovanteModo", v === "simplificado" ? "simplificado" : "completo")
            }
            disabled={busy || noLoja}
          >
            <SelectTrigger aria-labelledby="imp-modo-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completo">Completo (itens detalhados)</SelectItem>
              <SelectItem value="simplificado">Simplificado (resumo)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!browserOnly ? (
          <div className="space-y-2 min-w-0">
            <Label htmlFor="imp-vias">Vias do cupom</Label>
            <Input
              id="imp-vias"
              type="number"
              min={1}
              max={5}
              value={form.viasCupom}
              onChange={(e) => patch("viasCupom", Number(e.target.value) || 1)}
              disabled={busy || noLoja}
            />
          </div>
        ) : null}

        <div className="space-y-2 min-w-0 sm:col-span-2">
          <Label htmlFor="imp-rodape">Rodapé do cupom</Label>
          <Input
            id="imp-rodape"
            placeholder="Opcional — sobrescreve o rodapé geral da unidade quando preenchido"
            value={form.rodapeCupom}
            onChange={(e) => patch("rodapeCupom", e.target.value)}
            disabled={busy || noLoja}
          />
        </div>
      </div>

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
        {switches.map(([key, label, hint]) => (
          <li key={key} className="flex items-start justify-between gap-4 px-4 py-3 min-w-0">
            <div className="min-w-0">
              <p id={`imp-${key}-label`} className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <Switch
              aria-labelledby={`imp-${key}-label`}
              checked={form[key]}
              onCheckedChange={(v) => patch(key, v)}
              disabled={busy || noLoja}
            />
          </li>
        ))}
      </ul>

      {browserOnly ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Impressão automática após a venda, impressora térmica conectada diretamente (rede ou USB), vias automáticas e gaveta de dinheiro dependem de
          equipamento homologado e não são configuradas por esta tela.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={busy || !dirty}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={busy || noLoja || !dirty}>
          {saving ? "Salvando…" : "Salvar impressão"}
        </Button>
        {browserOnly ? (
          <Button type="button" variant="secondary" onClick={() => void handleBrowserPreview()} disabled={busy || noLoja}>
            <Eye className="mr-2 h-4 w-4" />
            Prévia no navegador
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleTestPrint()}
            disabled={busy || noLoja || testing}
          >
            <Printer className="mr-2 h-4 w-4" />
            {testing ? "Testando…" : "Testar impressão"}
          </Button>
        )}
      </div>
    </SettingsCard>
  );
}
