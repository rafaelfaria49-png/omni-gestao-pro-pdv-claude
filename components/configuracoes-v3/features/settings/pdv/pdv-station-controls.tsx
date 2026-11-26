"use client";

/**
 * Peças reutilizáveis da aba PDV e impressão, sobre primitivas que Configurações já usa
 * (Radix RadioGroup, Switch e Tooltip das cópias em components/configuracoes-v3/components/ui).
 */
import type { ReactNode } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { ArrowUpRight, Building2, Minus, Monitor, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { Switch } from "@/components/configuracoes-v3/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/configuracoes-v3/components/ui/tooltip";
import { cn } from "@/components/configuracoes-v3/lib/utils";
import type { PdvFailure } from "./pdv-station-model";

export type PdvScope = "unidade" | "computador";

export function PendingDot({ label = "Alteração não salva" }: { label?: string }) {
  return <span className="cx-dot" role="img" aria-label={label} title={label} />;
}

const SCOPE_COPY: Record<PdvScope, { label: string; tip: string; Icon: typeof Building2 }> = {
  unidade: {
    label: "Unidade",
    tip: "Gravado no servidor para todos os caixas desta unidade.",
    Icon: Building2,
  },
  computador: {
    label: "Este computador",
    tip: "Gravado só neste computador (OmniGestão Pro para Windows). Outros caixas não mudam.",
    Icon: Monitor,
  },
};

/**
 * Onde a preferência fica gravada. Não é parada de Tab: o texto visível e a descrição da seção já
 * dizem o escopo; a dica no hover é reforço.
 */
export function ScopeTag({ scope }: { scope: PdvScope }) {
  const { label, tip, Icon } = SCOPE_COPY[scope];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="note"
          aria-label={`Gravado em: ${label}. ${tip}`}
          className="inline-flex h-6 shrink-0 cursor-default items-center gap-1.5 rounded-full border border-border px-2 text-[11px] font-medium text-muted-foreground"
        >
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs leading-snug">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function SectionHead({
  id,
  title,
  description,
  scope,
  pending,
  extra,
}: {
  id: string;
  title: string;
  description: ReactNode;
  scope?: PdvScope;
  pending?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 flex-1">
        {/* O id fica no texto: o ponto de pendência não entra no nome dos grupos rotulados por este título. */}
        <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.01em] text-foreground">
          <span id={`${id}-title`}>{title}</span>
          {pending ? <PendingDot label="Alterações não salvas" /> : null}
        </h2>
        <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {extra}
        {scope ? <ScopeTag scope={scope} /> : null}
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <h3 className="cx-subhead m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>;
}

export function Row({
  label,
  labelId,
  help,
  pending,
  children,
  top,
  stack,
  testId,
}: {
  label: ReactNode;
  labelId?: string;
  help?: ReactNode;
  pending?: boolean;
  children: ReactNode;
  top?: boolean;
  stack?: boolean;
  testId?: string;
}) {
  return (
    <div className={cn("cx-row", top && "cx-row--top", stack && "cx-row--stack")} data-testid={testId}>
      <div className="min-w-0">
        {/* Nome estável do controle: o ponto de pendência fica fora do elemento que o rotula. */}
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span id={labelId}>{label}</span>
          {pending ? <PendingDot /> : null}
        </p>
        {help ? <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{help}</div> : null}
      </div>
      <div className="cx-row__control min-w-0">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabelledby,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string }[];
  ariaLabelledby?: string;
  disabled?: boolean;
}) {
  return (
    <RadioGroupPrimitive.Root
      className="cx-seg"
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-labelledby={ariaLabelledby}
      disabled={disabled}
      orientation="horizontal"
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className="cx-seg__item"
          aria-label={o.sub ? `${o.label}, ${o.sub}` : undefined}
        >
          <span className="text-[0.8rem] font-medium leading-tight">{o.label}</span>
          {o.sub ? <span className="cx-mono text-[11px] leading-tight text-muted-foreground">{o.sub}</span> : null}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export function Toggle({
  checked,
  onChange,
  labelledBy,
  describedBy,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <Switch
      className="cx-switch"
      checked={checked}
      onCheckedChange={onChange}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
    />
  );
}

/** Diferença “em vigor → novo”, em tinta neutra; o valor novo ganha peso. */
export function Diff({ from, to }: { from: string; to: string }) {
  if (from === to) return <span>{to}</span>;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1">
      <span className="text-muted-foreground line-through decoration-1">{from}</span>
      <span aria-hidden className="text-muted-foreground">→</span>
      <span className="font-semibold text-foreground">{to}</span>
    </span>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  labelledBy,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  const v = Math.min(max, Math.max(min, Math.round(value) || min));
  return (
    <div className="cx-stepper inline-flex h-10 items-center rounded-lg border border-border bg-card" role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        className="grid h-full w-10 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        onClick={() => onChange(v - 1)}
        disabled={disabled || v <= min}
        aria-label="Menos uma via"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <output className="cx-mono w-10 text-center text-sm font-semibold" aria-live="polite">
        {v}
      </output>
      <button
        type="button"
        className="grid h-full w-10 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        onClick={() => onChange(v + 1)}
        disabled={disabled || v >= max}
        aria-label="Mais uma via"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function UndoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cx-touch inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`Desfazer alterações em ${label}`}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      Desfazer
    </button>
  );
}

/** Falha junto da seção. O anúncio para leitor de tela é feito uma única vez, pela barra. */
export function BlockAlert({ failure }: { failure?: PdvFailure }) {
  if (!failure) return null;
  return (
    <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-foreground">
      <TriangleAlert className="cx-accent-ink mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{failure.message}</span>
    </p>
  );
}

export function ShortcutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="cx-touch inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    </a>
  );
}
