'use client'

import * as React from 'react'
import { Calendar, CheckCircle2, Clock, Cpu, Milestone, Rocket, type LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { cn } from '@/lib/utils'

export type RoadmapPhase = 'planejado' | 'desenvolvimento' | 'preview' | 'beta'

interface RoadmapPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  phase: RoadmapPhase
  icon?: LucideIcon
  features?: string[]
  targetRelease?: string
}

const PHASE_CONFIG: Record<
  RoadmapPhase,
  { label: string; badgeClass: string; icon: typeof Clock }
> = {
  planejado: {
    label: 'Planejado (Fase 3)',
    badgeClass: 'border-muted-foreground/30 bg-muted/50 text-muted-foreground',
    icon: Clock,
  },
  desenvolvimento: {
    label: 'Em Desenvolvimento (Fase 2)',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    icon: Cpu,
  },
  preview: {
    label: 'Preview do Desenvolvedor',
    badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
    icon: Milestone,
  },
  beta: {
    label: 'Beta Público',
    badgeClass: 'border-success/30 bg-success/10 text-success',
    icon: Rocket,
  },
}

export function RoadmapPreviewDialog({
  open,
  onOpenChange,
  title,
  description,
  phase,
  icon: Icon,
  features = [],
  targetRelease,
}: RoadmapPreviewDialogProps) {
  const config = PHASE_CONFIG[phase]
  const PhaseIcon = config.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div>
              <DialogTitle className="font-display text-lg font-bold tracking-tight">
                {title}
              </DialogTitle>
              <div className="mt-1 flex flex-wrap gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                    config.badgeClass,
                  )}
                >
                  <PhaseIcon className="h-3 w-3" />
                  {config.label}
                </span>
                {targetRelease && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {targetRelease}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>

          {features.length > 0 && (
            <div className="rounded-xl border border-border bg-panel/50 p-4 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                O que está incluído no escopo:
              </h4>
              <ul className="space-y-2">
                {features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="leading-relaxed">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-[11px] leading-normal text-muted-foreground/80 border-t border-border/60 pt-3">
            <span className="font-semibold text-foreground">Nota de transparência:</span> Este recurso faz parte da nossa visão futura de produto para o OmniGestão Pro. Estamos trabalhando continuamente para trazer esta funcionalidade com estabilidade e performance no padrão enterprise.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
