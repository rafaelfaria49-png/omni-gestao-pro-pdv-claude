"use client";

import { useEffect, useMemo, useState } from "react";
import type { OperacaoHubAcaoInput } from "@/app/actions/operacoes";
import type { OrdemServico } from "@/types/os";
import { getOperacaoStatusMeta, normalizeOperacaoStatus } from "@/components/operacoes/lovable/utils/os-status";
import { useOS } from "@/store/osStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Hammer,
  Loader2,
  Package,
  Play,
  Send,
  Stethoscope,
  ThumbsDown,
  Truck,
} from "lucide-react";
import { validateOrcamentoEstoque, type EstoqueOrcamentoIssue } from "@/api/os";

export function OperacaoOsAcaoBar({ os, onDone }: { os: OrdemServico; onDone?: () => void }) {
  const { applyHubAcao, refresh } = useOS();
  const [busy, setBusy] = useState(false);
  const [obsTexto, setObsTexto] = useState("");
  const [obsInterna, setObsInterna] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmForceServicoOpen, setConfirmForceServicoOpen] = useState(false);
  const [confirmEntregaOpen, setConfirmEntregaOpen] = useState(false);
  const [entregaEstoque, setEntregaEstoque] = useState<{
    loading: boolean;
    ok: boolean;
    issues: EstoqueOrcamentoIssue[];
  }>({ loading: false, ok: true, issues: [] });

  const st = useMemo(() => normalizeOperacaoStatus(os.status), [os.status]);
  const meta = useMemo(() => getOperacaoStatusMeta(st), [st]);
  const orc = os.orcamento;

  const run = async (acao: OperacaoHubAcaoInput) => {
    setBusy(true);
    try {
      await applyHubAcao(os.id, acao);
      toast.success("Atualizado.");
      await refresh();
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  };

  const podeDiagnostico = st === "aberta";
  const podeEnviarOrc =
    !!orc && st !== "entregue" && st !== "cancelada" && (st === "diagnostico" || st === "aguardando_aprovacao");
  const podeAprovar =
    !!orc &&
    orc.status !== "aprovado" &&
    orc.status !== "recusado" &&
    (orc.status === "enviado" || orc.status === "rascunho") &&
    (st === "aguardando_aprovacao" || st === "diagnostico");
  const podeReprovar =
    !!orc && orc.status !== "recusado" && orc.status !== "aprovado" && st !== "entregue" && st !== "cancelada";
  const podeIniciarServicoNormal = st === "aprovado";
  const podeIniciarServicoForcado = st === "aguardando_aprovacao" && !!orc && orc.status === "enviado";
  const podeAguardarPeca = st === "em_execucao";
  const podePronta = st === "em_execucao" || st === "aguardando_peca";
  const podeEntregar = st === "pronta";
  const podeCancelar = st !== "entregue" && st !== "cancelada";
  const podeObs = st !== "entregue" && st !== "cancelada";

  useEffect(() => {
    if (!confirmEntregaOpen) return;
    let cancelled = false;
    setEntregaEstoque({ loading: true, ok: true, issues: [] });
    void validateOrcamentoEstoque(os.id).then((r) => {
      if (!cancelled) setEntregaEstoque({ loading: false, ok: r.ok, issues: r.issues });
    });
    return () => {
      cancelled = true;
    };
  }, [confirmEntregaOpen, os.id]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">Status operacional</div>
        <Badge variant="outline" className={meta.badgeClass}>
          {meta.label}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !podeDiagnostico}
          className="gap-1.5"
          onClick={() => void run({ kind: "iniciar_diagnostico" })}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
          Iniciar diagnóstico
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !podeEnviarOrc}
          className="gap-1.5"
          onClick={() => void run({ kind: "enviar_orcamento" })}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Enviar orçamento
        </Button>

        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={busy || !podeAprovar}
          className="gap-1.5"
          onClick={() => void run({ kind: "aprovar_orcamento" })}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Aprovar orçamento
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !podeReprovar}
          className="gap-1.5"
          onClick={() => void run({ kind: "reprovar_orcamento" })}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
          Reprovar orçamento
        </Button>

        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={busy || !(podeIniciarServicoNormal || podeIniciarServicoForcado)}
          className="gap-1.5"
          onClick={() => {
            if (podeIniciarServicoNormal) void run({ kind: "iniciar_servico" });
            else setConfirmForceServicoOpen(true);
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Iniciar serviço
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !podeAguardarPeca}
          className="gap-1.5"
          onClick={() => void run({ kind: "aguardar_peca" })}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
          Aguardar peça
        </Button>

        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={busy || !podePronta}
          className="gap-1.5"
          onClick={() => void run({ kind: "marcar_pronta" })}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
          Marcar pronta
        </Button>

        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={busy || !podeEntregar}
          className="gap-1.5"
          onClick={() => setConfirmEntregaOpen(true)}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
          Entregar ao cliente
        </Button>

        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={busy || !podeCancelar}
          className="gap-1.5"
          onClick={() => setConfirmCancelOpen(true)}
        >
          <Ban className="h-3.5 w-3.5" />
          Cancelar OS
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Adicionar observação
        </div>
        <Textarea
          value={obsTexto}
          onChange={(e) => setObsTexto(e.target.value)}
          placeholder="Descreva a observação…"
          rows={2}
          disabled={busy || !podeObs}
          className="text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={obsInterna} onCheckedChange={(v) => setObsInterna(v === true)} disabled={busy || !podeObs} />
            Observação interna
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !podeObs || !obsTexto.trim()}
            onClick={async () => {
              const t = obsTexto.trim();
              if (!t) return;
              await run({ kind: "adicionar_observacao", texto: t, interna: obsInterna });
              setObsTexto("");
              setObsInterna(false);
            }}
          >
            Registrar
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta OS?</AlertDialogTitle>
            <AlertDialogDescription>
              A OS será marcada como cancelada. Esta ação não se aplica a OS já entregues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmCancelOpen(false);
                void run({ kind: "cancelar" });
              }}
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmForceServicoOpen} onOpenChange={setConfirmForceServicoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar serviço sem aprovação formal?</AlertDialogTitle>
            <AlertDialogDescription>
              O orçamento ainda não está no status “Aprovado”. Confirme apenas se a loja assumir o risco operacional.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmForceServicoOpen(false);
                void run({ kind: "iniciar_servico", iniciarSemAprovacaoConfirmado: true });
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEntregaOpen} onOpenChange={setConfirmEntregaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar entrega ao cliente?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Ao entregar, o sistema tentará baixar o estoque real das peças vinculadas ao catálogo (idempotente).
                </p>
                {entregaEstoque.loading ? (
                  <div className="flex items-center gap-2 py-2 text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando disponibilidade…
                  </div>
                ) : !entregaEstoque.ok ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    <p className="font-medium">Estoque insuficiente para concluir a entrega.</p>
                    <ul className="mt-1 list-inside list-disc">
                      {entregaEstoque.issues.map((i) => (
                        <li key={i.produtoId}>
                          {i.nome}: necessário {i.necessario}, disponível {i.disponivel}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px]">Ajuste o orçamento ou repor estoque antes de entregar.</p>
                  </div>
                ) : (
                  <p className="text-emerald-600 dark:text-emerald-400">Estoque compatível com o planejado.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || entregaEstoque.loading || !entregaEstoque.ok}
              onClick={() => {
                setConfirmEntregaOpen(false);
                void run({ kind: "entregar_cliente" });
              }}
            >
              Confirmar entrega
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
