"use client";

import { useMemo } from "react";
import { Sparkles, CalendarDays, Clock, Hash, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type DayMeta = {
  day: number;
  label?: string;
  tone?: "primary" | "success" | "muted";
  time?: string;
};

const PLANNED: Record<number, DayMeta> = {
  3: { day: 3, label: "Reel · Coleção", tone: "primary", time: "19h" },
  6: { day: 6, label: "Story flash", tone: "success", time: "12h" },
  9: { day: 9, label: "Promo estoque", tone: "primary", time: "20h" },
  12: { day: 12, label: "Carrossel", tone: "muted", time: "10h" },
  15: { day: 15, label: "Reel viral", tone: "primary", time: "21h" },
  18: { day: 18, label: "WhatsApp", tone: "success", time: "11h" },
  22: { day: 22, label: "TikTok dança", tone: "primary", time: "20h" },
  25: { day: 25, label: "Live coleção", tone: "success", time: "19h" },
  28: { day: 28, label: "Recap mensal", tone: "muted", time: "18h" },
};

export const CalendarTab = () => {
  const now = new Date();
  const monthLabel = now.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cells = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, []);

  const toneClass = (tone?: DayMeta["tone"]) => {
    switch (tone) {
      case "primary":
        return "bg-muted/50 text-primary border-primary/30";
      case "success":
        return "bg-success/10 text-success border-success/30";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero CTA */}
      <div className="glass-card rounded-2xl p-6 animate-fade-in-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="rounded-xl bg-gradient-primary p-3 text-primary-foreground shadow-glow">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-foreground">Gerar Mês Completo com IA</h2>
            <p className="mt-1 text-base text-muted-foreground">
              A IA analisa seu estoque parado e sugere os melhores horários e hashtags
              para cada peça do mês — sem que você precise pensar em pauta.
            </p>
          </div>
          <Button className="btn-glow gap-2 bg-gradient-primary px-6 py-6 text-base text-primary-foreground hover:opacity-95 shadow-glow">
            <Sparkles className="h-5 w-5" />
            Gerar Mês com IA
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Clock, title: "Horários Inteligentes", desc: "Picos de engajamento por canal" },
            { icon: Hash, title: "Hashtags Otimizadas", desc: "Trends + nicho da loja" },
            { icon: TrendingUp, title: "Foco em Estoque Parado", desc: "Prioriza peças paradas há 30+ dias" },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card/50 p-4"
            >
              <f.icon className="h-5 w-5 text-primary" />
              <p className="mt-2 text-base font-semibold text-foreground">{f.title}</p>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="glass-card rounded-2xl p-6 animate-fade-in-up [animation-delay:80ms]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-primary p-2.5 text-primary-foreground shadow-glow">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold capitalize text-foreground">{monthLabel}</h2>
              <p className="text-base text-muted-foreground">
                Visão geral das publicações programadas
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary">
            {Object.keys(PLANNED).length} posts agendados
          </Badge>
        </div>

        {/* Weekdays header */}
        <div className="mt-6 grid grid-cols-7 gap-2">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="mt-2 grid grid-cols-7 gap-2">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`e-${idx}`} className="aspect-square rounded-lg" />;
            }
            const meta = PLANNED[day];
            const isToday = day === now.getDate();
            return (
              <div
                key={day}
                className={`relative flex aspect-square flex-col rounded-lg border p-1.5 transition-all hover:border-primary/40 ${
                  isToday
                    ? "border-primary bg-card ring-2 ring-primary/30"
                    : "border-border bg-card/40"
                }`}
              >
                <span
                  className={`text-xs font-bold ${
                    isToday ? "text-primary" : "text-foreground"
                  }`}
                >
                  {day}
                </span>
                {meta && (
                  <div
                    className={`mt-auto rounded-md border px-1 py-0.5 text-[9px] font-semibold leading-tight ${toneClass(
                      meta.tone,
                    )}`}
                  >
                    <p className="truncate">{meta.label}</p>
                    <p className="opacity-75">{meta.time}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border/60 pt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary" /> Reel / Vídeo
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-success" /> Story / WhatsApp
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-muted-foreground/50" /> Carrossel / Outros
          </div>
        </div>
      </div>
    </div>
  );
};
