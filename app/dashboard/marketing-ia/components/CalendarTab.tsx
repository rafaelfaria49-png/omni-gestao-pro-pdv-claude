"use client";

import { useMemo, useState } from "react";
import { Sparkles, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card/60 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="rounded-xl bg-gradient-primary p-3 text-primary-foreground shadow-md">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground">Calendário editorial</h2>
            <p className="text-sm text-muted-foreground">
              Posts agendados aparecem no dia. Clique em um dia para agendar o rascunho atual.
            </p>
          </div>
          <Button className="gap-2" onClick={mockMonthIdeas}>
            <Sparkles className="h-4 w-4" />
            Gerar mês com IA
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/15 p-2 text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold capitalize text-foreground">{monthLabel}</h3>
              <p className="text-sm text-muted-foreground">Clique no dia para agendar o conteúdo do Estúdio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Badge variant="outline" className="border-primary/40 text-primary">
              {scheduledCount} agendados
            </Badge>
          </div>
        </div>

        {scheduledCount === 0 && savedPosts.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
            Nenhum post ainda. Salve posts no Estúdio ou use &quot;Gerar mês com IA&quot; (simulado) para ver exemplos.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-7 gap-2">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`e-${idx}`} className="aspect-square rounded-lg" />;
            }
            const cellDate = new Date(viewYear, viewMonth, day);
            const list = postsForDay(savedPosts, cellDate);
            const isToday = sameCalendarDay(cellDate, new Date());
            return (
              <button
                key={day}
                type="button"
                onClick={() => openDay(day)}
                className={cn(
                  "relative flex aspect-square flex-col rounded-lg border p-1 text-left transition-all hover:border-primary/50",
                  isToday ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card/40",
                )}
              >
                <span className={cn("text-xs font-bold", isToday ? "text-primary" : "text-foreground")}>
                  {day}
                </span>
                <div className="mt-auto flex max-h-[70%] flex-col gap-0.5 overflow-hidden">
                  {list.slice(0, 3).map((p) => (
                    <span
                      key={p.id}
                      className="truncate rounded bg-primary/15 px-0.5 text-[8px] font-medium text-primary"
                      title={p.caption}
                    >
                      {p.caption.slice(0, 18)}…
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={dayDialogOpen} onOpenChange={setDayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Agendar neste dia
              {selectedDay
                ? ` (${selectedDay.toLocaleDateString("pt-BR")})`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Salva o post atual e define data/hora de publicação simulada.
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
