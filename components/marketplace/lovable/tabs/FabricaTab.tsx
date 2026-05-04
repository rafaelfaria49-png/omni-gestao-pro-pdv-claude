"use client";

import { AIBadge } from "../AIBadge";
import { Sparkles, Wand2, Layers, Link2, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

const improvements = [
  "Título inclui palavras-chave de alta busca (+27%)",
  "Descrição com bullets escaneáveis",
  "Foto principal em fundo neutro premium",
  "Especificações técnicas completas",
];

export function FabricaTab() {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({ title: "Integração pendente", description: PENDING_TOAST_DESCRIPTION });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {/* Main: Clonador */}
      <div className="surface-card surface-card-hover p-6 xl:col-span-2 relative overflow-hidden">
        <div className="absolute inset-0 -z-0 opacity-50 pointer-events-none" style={{ background: "radial-gradient(70% 50% at 0% 0%, hsl(var(--primary)/0.15), transparent 60%)" }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl font-semibold">Clonador de Anúncio</h3>
            <AIBadge />
          </div>
          <p className="text-sm text-muted-foreground mt-1">Reescreva qualquer anúncio com IA em segundos</p>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">URL do anúncio original</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-primary transition-colors">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="https://..." defaultValue="https://produto.mercadolivre.com.br/MLB-..." />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Tom de voz / diferencial</label>
              <div className="mt-1.5 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-primary transition-colors">
                <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Ex: profissional, gamer, premium" defaultValue="Premium, foco em conforto e durabilidade" />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm cursor-not-allowed opacity-80"
            >
              <Wand2 className="h-4 w-4" /> Otimizar anúncio com IA
            </button>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40 hover:text-primary transition-colors cursor-not-allowed opacity-80"
            >
              <Sparkles className="h-4 w-4" /> Anúncio único
            </button>
            <button
              onClick={showPendingToast}
              title="Integração pendente"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40 hover:text-primary transition-colors cursor-not-allowed opacity-80"
            >
              <Layers className="h-4 w-4" /> Clonagem em massa
            </button>
          </div>

          {/* Preview */}
          <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Preview otimizado</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 text-success px-2.5 py-1 text-xs font-bold">
                <CheckCircle2 className="h-3 w-3" /> Score 94/100
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
              <div className="aspect-square rounded-xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent grid place-items-center text-xs text-muted-foreground">
                Imagem otimizada
              </div>
              <div>
                <p className="font-display text-base font-semibold leading-snug">
                  Cadeira Gamer Pro Premium Reclinável 180° — Apoio Lombar, Braços 4D, Suporta 150kg
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Conforto profissional para longas jornadas. Estofamento em couro PU, base de aço reforçada e regulagem completa. Garantia de 2 anos.
                </p>
                <ul className="mt-3 space-y-1.5">
                  {improvements.map((m) => (
                    <li key={m} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* IA card */}
      <div className="surface-card surface-card-hover p-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-0 pointer-events-none" style={{ background: "radial-gradient(80% 60% at 100% 100%, hsl(var(--primary)/0.18), transparent 60%)" }} />
        <div className="relative">
          <AIBadge label="IA · Ação recomendada" />
          <h3 className="mt-3 font-display text-lg font-semibold">IA encontrou anúncios com baixa conversão</h3>
          <p className="mt-1 text-sm text-muted-foreground">38 anúncios apresentaram queda de CTR superior a 22% nos últimos 7 dias.</p>

          <div className="mt-5 space-y-2">
            {[
              { sku: "CG-PRO-001", drop: "-32% CTR" },
              { sku: "MS-RGB-010", drop: "-27% CTR" },
              { sku: "TC-MEC-099", drop: "-22% CTR" },
            ].map((it) => (
              <div key={it.sku} className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2.5">
                <span className="text-sm font-medium">{it.sku}</span>
                <span className="text-xs font-semibold text-destructive">{it.drop}</span>
              </div>
            ))}
          </div>

          <button
            onClick={showPendingToast}
            title="Integração pendente"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-not-allowed opacity-80"
          >
            Otimizar anúncios agora <ArrowUpRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-[11px] text-muted-foreground text-center">Economia estimada: <span className="text-success font-semibold">+R$ 4.820/mês</span></p>
        </div>
      </div>
    </div>
  );
}
