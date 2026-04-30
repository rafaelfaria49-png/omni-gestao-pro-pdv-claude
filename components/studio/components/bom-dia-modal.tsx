import { useMemo, useRef, useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Send,
  ChevronDown,
  Calendar as CalendarIcon,
  Clock,
  Clapperboard,
  CheckCircle2,
  AlertCircle,
  Tag,
  BadgeCheck,
  Music2,
  ArrowLeft,
  ArrowRight,
  Circle,
  Play,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type StudioTemplate = "bomDia" | "servico" | "antesDepois";

type Take = { title: string; script: string };

const TEMPLATES: Record<
  StudioTemplate,
  { title: string; subtitle: string; takes: Take[]; caption: string }
> = {
  bomDia: {
    title: "Bom Dia Automático",
    subtitle: "3 takes rápidos pra abrir o dia da sua loja com energia.",
    takes: [
      {
        title: "Rosto / Bom dia",
        script:
          "Sorriso largo, 3 segundos: 'Bom dia! Hoje a vitrine tá especial...'",
      },
      {
        title: "Produto / Loja",
        script:
          "Close de 5s na peça do dia. Mostre detalhe, tecido ou etiqueta.",
      },
      {
        title: "Chamada pra ação",
        script:
          "Aponte pra câmera: 'Chama no direct e garanta a sua antes que acabe!'",
      },
    ],
    caption:
      "☀️ Bom dia! Hoje tem peça novinha esperando por você. Corre no direct! ✨",
  },
  servico: {
    title: "Status de Serviço",
    subtitle: "Mostre que o trabalho tá rolando — gera confiança no cliente.",
    takes: [
      { title: "Diagnóstico", script: "Mostre o equipamento e descreva o problema em 5s." },
      { title: "Mãos à obra", script: "Close nas suas mãos trabalhando. 'Tô resolvendo agora.'" },
      { title: "Entrega", script: "Equipamento funcionando. 'Pronto e testado, pode buscar!'" },
    ],
    caption:
      "🔧 Serviço concluído com cuidado e garantia. Sua confiança é o nosso compromisso.",
  },
  antesDepois: {
    title: "Showcase Antes e Depois",
    subtitle: "A transformação vende sozinha — em 3 takes.",
    takes: [
      { title: "O Problema", script: "Grave 4s do estado original. Sem cortes, mostre a verdade." },
      { title: "A Solução", script: "Time-lapse de 6s do trabalho acontecendo." },
      { title: "O Brilho Final", script: "Panorâmica lenta do resultado. Deixe a mágica falar." },
    ],
    caption: "✨ Antes e depois que fala por si. Resultado que você merece.",
  },
};

const MOODS = [
  { id: "animado", label: "Animado", desc: "Pop / energia" },
  { id: "relaxante", label: "Relaxante", desc: "Lo-fi / calmo" },
  { id: "promocao", label: "Promoção", desc: "Beat urgente" },
] as const;

interface BomDiaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: StudioTemplate;
}

export function BomDiaModal({
  open,
  onOpenChange,
  template = "bomDia",
}: BomDiaModalProps) {
  const tpl = TEMPLATES[template];

  const [activeTake, setActiveTake] = useState(0);
  const [takeMedia, setTakeMedia] = useState<(string | null)[]>([null, null, null]);
  const [showFraming, setShowFraming] = useState(false);
  const [message, setMessage] = useState(tpl.caption);
  const [mood, setMood] = useState<(typeof MOODS)[number]["id"]>("animado");
  const [showLogo, setShowLogo] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("09:00");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Reset when template changes
  useMemo(() => {
    setMessage(tpl.caption);
    setActiveTake(0);
    setTakeMedia([null, null, null]);
  }, [template, tpl.caption]);

  const completedTakes = takeMedia.filter(Boolean).length;
  const allTakesDone = completedTakes === 3;

  const [previewMood, setPreviewMood] = useState<string | null>(null);
  const [takeAnim, setTakeAnim] = useState(false);

  const handleFile = (file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setTakeMedia((prev) => prev.map((m, i) => (i === activeTake ? url : m)));
    setShowFraming(false);
    // Auto-advance to next take with smooth transition
    if (activeTake < 2) {
      setTimeout(() => {
        setTakeAnim(true);
        setActiveTake((i) => Math.min(2, i + 1));
        setTimeout(() => setTakeAnim(false), 350);
      }, 400);
    }
  };

  const openCamera = () => {
    setShowFraming(true);
    setTimeout(() => cameraInputRef.current?.click(), 250);
  };

  const removeTake = (idx: number) => {
    setTakeMedia((prev) => prev.map((m, i) => (i === idx ? null : m)));
  };

  const scheduleLabel = useMemo(() => {
    if (!scheduleDate) return null;
    return `${format(scheduleDate, "dd 'de' MMM", { locale: ptBR })} às ${scheduleTime}`;
  }, [scheduleDate, scheduleTime]);

  const currentMedia = takeMedia[activeTake];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-card max-h-[94vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-display flex items-center gap-2 text-2xl">
            <Sparkles className="h-5 w-5 text-primary" />
            {tpl.title}
          </DialogTitle>
          <DialogDescription>{tpl.subtitle}</DialogDescription>
        </DialogHeader>

        {/* TAKES STEPPER */}
        <div className="px-6 pt-3 pb-4">
          <div className="flex items-center justify-between gap-2">
            {tpl.takes.map((t, i) => {
              const done = !!takeMedia[i];
              const active = i === activeTake;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveTake(i)}
                  className="flex items-center gap-3 flex-1 group"
                >
                  <div
                    className={cn(
                      "relative h-9 w-9 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                      active && "border-primary bg-primary text-primary-foreground scale-110",
                      done && !active && "border-primary bg-primary/15 text-primary",
                      !done && !active && "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-bold">{i + 1}</span>
                    )}
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-xs uppercase tracking-wide font-semibold",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      Take {i + 1}
                    </p>
                    <p className="text-sm font-medium text-foreground truncate">
                      {t.title}
                    </p>
                  </div>
                  {i < tpl.takes.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-4 rounded-full",
                        takeMedia[i] ? "bg-primary" : "bg-border",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 pb-6">
          {/* LEFT — Camera viewport */}
          <div className="flex flex-col gap-4">
            <div
              className={cn(
                "relative aspect-[9/16] sm:aspect-square w-full rounded-2xl border border-border bg-background overflow-hidden transition-all duration-300",
                takeAnim && "opacity-0 scale-[0.98]",
              )}
            >
              {currentMedia ? (
                <>
                  <img
                    src={currentMedia}
                    alt={`Take ${activeTake + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {showLogo && (
                    <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-card/85 backdrop-blur border border-border text-xs font-semibold text-foreground shadow-sm z-10">
                      <BadgeCheck className="inline h-3.5 w-3.5 mr-1 text-primary" />
                      SUA MARCA
                    </div>
                  )}
                  {showPrice && (
                    <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-bold shadow-lg z-10">
                      <Tag className="inline h-3.5 w-3.5 mr-1" />
                      R$ 99,90
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeTake(activeTake)}
                    className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md hover:opacity-90 z-10"
                    aria-label="Remover take"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <SafetyZones />
                </>
              ) : (
                <CameraViewfinder framing={showFraming} />
              )}
            </div>

            {/* Capture controls */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={activeTake === 0}
                onClick={() => setActiveTake((i) => Math.max(0, i - 1))}
                aria-label="Take anterior"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <button
                type="button"
                onClick={openCamera}
                className="relative flex flex-col items-center gap-1 mx-auto group"
                aria-label={`Gravar Take ${activeTake + 1}`}
              >
                <span className="h-16 w-16 rounded-full bg-primary shadow-lg flex items-center justify-center group-hover:scale-105 transition-transform ring-4 ring-primary/20">
                  <Circle className="h-12 w-12 text-primary-foreground" fill="currentColor" />
                </span>
                <span className="text-xs font-semibold text-foreground">
                  Gravar Take {activeTake + 1}
                </span>
              </button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => galleryInputRef.current?.click()}
                aria-label="Escolher da galeria"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={activeTake === 2}
                onClick={() => setActiveTake((i) => Math.min(2, i + 1))}
                aria-label="Próximo take"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* RIGHT — Director, overlays, caption, music */}
          <div className="flex flex-col gap-4">
            {/* Director's script */}
            <div className="rounded-xl border border-border bg-muted/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <Clapperboard className="h-4 w-4 text-primary" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  Roteiro · Take {activeTake + 1}
                </h4>
              </div>
              <p className="text-base font-display font-semibold text-foreground mb-1">
                {tpl.takes[activeTake].title}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {tpl.takes[activeTake].script}
              </p>
            </div>

            {/* Overlays */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Overlays automáticos
              </p>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">Inserir Logotipo</span>
                </div>
                <Switch checked={showLogo} onCheckedChange={setShowLogo} />
              </label>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <span className="text-sm text-foreground">Etiqueta de Preço</span>
                </div>
                <Switch checked={showPrice} onCheckedChange={setShowPrice} />
              </label>
            </div>

            {/* Mood / soundtrack */}
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Music2 className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Trilha Sonora
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MOODS.map((m) => {
                  const active = mood === m.id;
                  const playing = previewMood === m.id;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "relative rounded-lg border px-3 py-2 transition-colors cursor-pointer",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-accent/50",
                      )}
                      onClick={() => setMood(m.id)}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewMood(playing ? null : m.id);
                          if (!playing) {
                            setTimeout(() => setPreviewMood(null), 3000);
                          }
                        }}
                        className={cn(
                          "absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center transition-colors",
                          playing
                            ? "bg-primary text-primary-foreground animate-pulse"
                            : "bg-muted text-foreground hover:bg-primary hover:text-primary-foreground",
                        )}
                        aria-label={`Ouvir prévia ${m.label}`}
                      >
                        <Play className="h-3 w-3" fill="currentColor" />
                      </button>
                      <p
                        className={cn(
                          "text-sm font-semibold pr-6",
                          active ? "text-primary" : "text-foreground",
                        )}
                      >
                        {m.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Caption */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  Legenda gerada pela IA
                </label>
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  <Sparkles className="mr-1 h-3 w-3" /> Nova versão
                </Button>
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="resize-none bg-background"
              />
            </div>

            {!allTakesDone && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Faltam {3 - completedTakes} take(s). Grave todos para liberar a postagem.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-6 py-4 bg-muted/40 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <div className="flex items-stretch">
            <Button
              size="lg"
              className="rounded-r-none px-6"
              disabled={!allTakesDone}
              onClick={() => onOpenChange(false)}
            >
              <Send className="mr-2 h-4 w-4" />
              Postar Imediatamente
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="lg"
                  className="rounded-l-none border-l border-primary-foreground/20 px-3"
                  disabled={!allTakesDone}
                  aria-label="Agendar"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0">
                <DropdownMenuLabel className="px-3 pt-3">
                  Agendar para depois
                </DropdownMenuLabel>
                <div className="p-3 space-y-3">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={setScheduleDate}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="p-0 pointer-events-auto"
                  />
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!scheduleDate}
                    onClick={() => onOpenChange(false)}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleLabel ? `Agendar para ${scheduleLabel}` : "Escolher data"}
                  </Button>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => {}}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Sugerir melhor horário (IA)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CameraViewfinder({ framing }: { framing: boolean }) {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-foreground/5 via-background to-foreground/5 flex items-center justify-center">
      {/* Instagram safety lines (top + bottom UI zones) */}
      <div className="absolute inset-x-0 top-0 h-[14%] bg-foreground/5 border-b border-dashed border-foreground/20 flex items-end justify-center pb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Zona da UI do Instagram
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[20%] bg-foreground/5 border-t border-dashed border-foreground/20 flex items-start justify-center pt-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Zona dos botões / legenda
        </span>
      </div>

      {/* Rule of thirds */}
      <div className="absolute inset-x-0 top-[14%] bottom-[20%] grid grid-cols-3 grid-rows-3 pointer-events-none">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="border border-foreground/10" />
        ))}
      </div>

      {/* Corner brackets in the safe zone */}
      <div className="absolute inset-x-6 top-[16%] bottom-[22%] pointer-events-none">
        <span className="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-primary rounded-tl-md" />
        <span className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-primary rounded-tr-md" />
        <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-primary rounded-bl-md" />
        <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-primary rounded-br-md" />
      </div>

      {/* Center subject */}
      <div
        className={cn(
          "relative h-32 w-32 rounded-full border-2 border-dashed border-primary/60 flex items-center justify-center",
          framing && "animate-pulse",
        )}
      >
        <div className="text-center px-2">
          <Camera className="h-6 w-6 text-primary mx-auto mb-1" />
          <p className="text-[11px] font-medium text-foreground">
            {framing ? "Abrindo câmera..." : "Posicione aqui"}
          </p>
        </div>
      </div>
      <SafetyZones />
    </div>
  );
}

/**
 * Thin dashed safety lines marking where Instagram Reels UI (side icons,
 * caption, bottom buttons) typically covers the frame. Overlays on top of
 * media so the user keeps the subject inside the safe area.
 */
function SafetyZones() {
  return (
    <div className="absolute inset-0 pointer-events-none z-[5]">
      {/* Side margins (Reels right-rail icons + left text) */}
      <div className="absolute top-[10%] bottom-[22%] left-[6%] border-l border-dashed border-white/40" />
      <div className="absolute top-[10%] bottom-[22%] right-[6%] border-r border-dashed border-white/40" />
      {/* Bottom margin (caption + action bar) */}
      <div className="absolute left-[6%] right-[6%] bottom-[22%] border-b border-dashed border-white/40" />
    </div>
  );
}
