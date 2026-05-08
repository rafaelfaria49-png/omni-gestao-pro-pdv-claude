"use client";

import { useMemo, useState } from "react";
import { Sparkles, CalendarDays, ChevronLeft, ChevronRight, Instagram, MessageCircle, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useStudioPreview } from "./studio-preview-context";
import type { MarketingSavedPost, PreviewSurface } from "../lib/marketing-ia-types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAYS_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function postsForDay(posts: MarketingSavedPost[], day: Date): MarketingSavedPost[] {
  return posts.filter((p) => {
    if (!p.scheduledAt) return false;
    return sameCalendarDay(new Date(p.scheduledAt), day);
  });
}

function surfaceDot(s: PreviewSurface): string {
  if (s === "whatsapp") return "bg-[#075e54]";
  if (s === "ad") return "bg-amber-500";
  return "bg-purple-500";
}

export function CalendarTab() {
  const { savedPosts, setSavedPosts, scheduleCurrentPostForDate, preview } = useStudioPreview();
  const { toast } = useToast();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayTime, setDayTime] = useState("10:00");

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [viewYear, viewMonth]);

  const scheduledCount = savedPosts.filter((p) => p.scheduledAt).length;

  const openDay = (dayNum: number) => {
    setSelectedDay(new Date(viewYear, viewMonth, dayNum));
    setDayTime("10:00");
    setDayDialogOpen(true);
  };

  const confirmScheduleCurrent = async () => {
    if (!selectedDay) return;
    const [hh, mm] = dayTime.split(":").map(Number);
    const dt = new Date(selectedDay);
    dt.setHours(hh || 10, mm || 0, 0, 0);
    if (!preview.caption.trim() && !preview.takeMedia[0]) {
      toast({
        title: "Nada para agendar",
        description: "Crie conteúdo no Estúdio IA antes de agendar.",
        variant: "destructive",
      });
      return;
    }
    try {
      await scheduleCurrentPostForDate(dt.toISOString());
      setDayDialogOpen(false);
      toast({ title: "Agendado", description: "Post salvo e agendado neste dia." });
    } catch {
      toast({ title: "Erro ao agendar", variant: "destructive" });
    }
  };

  const mockMonthIdeas = () => {
    toast({
      title: "Função simulada",
      description: "Integração real de sugestões mensais será adicionada depois.",
    });
    const surfaces: PreviewSurface[] = ["instagram", "whatsapp", "ad"];
    const captions = [
      "Semana de ofertas — aproveite antes que acabe!",
      "Novidade em destaque na vitrine.",
      "Liquidação relâmpago só hoje.",
    ];
    const extras: MarketingSavedPost[] = [5, 12, 19].map((d, i) => ({
      id: crypto.randomUUID(),
      caption: captions[i % captions.length]!,
      hashtags: "#promo #loja",
      imageUrl: null,
      previewSurface: surfaces[i % surfaces.length]!,
      cta: "Ver ofertas",
      template: "bomDia",
      createdAt: new Date().toISOString(),
      scheduledAt: new Date(viewYear, viewMonth, d, 14, 0, 0, 0).toISOString(),
      status: "scheduled" as const,
    }));
    setSavedPosts((prev) => [...prev, ...extras]);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card/60 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-xl bg-gradient-primary p-2.5 text-primary-foreground shadow-md w-fit">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground">Calendário editorial</h2>
            <p className="text-xs text-muted-foreground">
              Posts agendados aparecem no dia. Clique em um dia para agendar o rascunho atual.
            </p>
          </div>
          <Button size="sm" className="gap-2 shrink-0" onClick={mockMonthIdeas}>
            <Sparkles className="h-3.5 w-3.5" />
            Gerar mês com IA
          </Button>
        </div>
      </div>

      {/* Calendário */}
      <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
        {/* Navegação */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
              <CalendarDays className="h-4 w-4" />
            </div>
            <h3 className="text-base font-bold capitalize text-foreground">{monthLabel}</h3>
            {scheduledCount > 0 && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                {scheduledCount} agendados
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Legenda */}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-purple-500" />Instagram</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#075e54]" />WhatsApp</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />Anúncio</span>
        </div>

        {/* Header dos dias da semana */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1"
            >
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
            </div>
          ))}
        </div>

        {/* Grid de dias */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`e-${idx}`} className="min-h-[52px] sm:min-h-[64px]" />;
            }
            const cellDate = new Date(viewYear, viewMonth, day);
            const list = postsForDay(savedPosts, cellDate);
            const isToday = sameCalendarDay(cellDate, new Date());
            const overflow = list.length > 2;
            return (
              <button
                key={day}
                type="button"
                onClick={() => openDay(day)}
                className={cn(
                  "group relative flex min-h-[52px] sm:min-h-[64px] flex-col rounded-lg border p-1 sm:p-1.5 text-left transition-all hover:border-primary/50 hover:bg-primary/5",
                  isToday
                    ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                    : "border-border bg-card/40",
                )}
              >
                <span className={cn(
                  "text-[11px] font-bold leading-none",
                  isToday ? "text-primary" : "text-foreground"
                )}>
                  {day}
                </span>

                {/* Indicadores de posts */}
                {list.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {list.slice(0, 2).map((p) => (
                      <span
                        key={p.id}
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full",
                          surfaceDot(p.previewSurface)
                        )}
                        title={p.caption}
                      />
                    ))}
                    {overflow && (
                      <span className="text-[8px] font-bold text-muted-foreground leading-none mt-0.5">
                        +{list.length - 2}
                      </span>
                    )}
                  </div>
                )}

                {/* Títulos dos posts (só em telas maiores) */}
                <div className="hidden sm:flex mt-auto flex-col gap-0.5 w-full overflow-hidden">
                  {list.slice(0, 1).map((p) => (
                    <span
                      key={p.id}
                      className="truncate rounded-sm bg-primary/12 px-0.5 text-[8px] font-medium text-primary leading-tight"
                      title={p.caption}
                    >
                      {p.caption.slice(0, 14)}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {scheduledCount === 0 && savedPosts.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
            Nenhum post ainda. Salve no Estúdio ou use &quot;Gerar mês com IA&quot;.
          </p>
        )}
      </div>

      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Agendar neste dia
              {selectedDay ? ` (${selectedDay.toLocaleDateString("pt-BR")})` : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Salva o post atual do Estúdio com esta data de publicação.
          </p>
          <div className="space-y-2">
            <Label htmlFor="cal-time">Horário</Label>
            <Input id="cal-time" type="time" value={dayTime} onChange={(e) => setDayTime(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmScheduleCurrent}>Agendar post atual</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
