"use client";

import { useState } from "react";
import { CalendarClock, Pencil, Trash2, Instagram, MessageCircle, Megaphone, Hash, ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { useStudioPreview, type PreviewSurface } from "./studio-preview-context";
import type { MarketingSavedPost, PostStatus } from "../lib/marketing-ia-types";
import { cn } from "@/lib/utils";

function surfaceLabel(s: PreviewSurface): string {
  if (s === "whatsapp") return "WhatsApp";
  if (s === "ad") return "Anúncio";
  return "Instagram";
}

function surfaceIcon(s: PreviewSurface) {
  if (s === "whatsapp") return MessageCircle;
  if (s === "ad") return Megaphone;
  return Instagram;
}

function surfaceBg(s: PreviewSurface): string {
  if (s === "whatsapp") return "bg-[#075e54]/15 border-[#075e54]/20";
  if (s === "ad") return "bg-primary/10 border-primary/20";
  return "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20";
}

function statusBadge(status: PostStatus) {
  switch (status) {
    case "published":
      return <Badge className="bg-success/15 text-success border-success/30 text-[10px] h-5">Publicado</Badge>;
    case "scheduled":
      return <Badge variant="outline" className="border-primary/40 text-primary text-[10px] h-5">Agendado</Badge>;
    default:
      return <Badge variant="secondary" className="text-[10px] h-5">Rascunho</Badge>;
  }
}

export function PostGeneratorTab() {
  const { savedPosts, loadPostIntoPreview, deleteSavedPost, updatePostSchedule } = useStudioPreview();
  const { toast } = useToast();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");

  const openSchedule = (id: string) => {
    const p = savedPosts.find((x) => x.id === id);
    setSchedulingId(id);
    if (p?.scheduledAt) {
      const d = new Date(p.scheduledAt);
      setScheduleDate(d.toISOString().slice(0, 16));
    } else {
      setScheduleDate("");
    }
    setScheduleOpen(true);
  };

  const confirmSchedule = () => {
    if (!schedulingId || !scheduleDate) {
      toast({ title: "Data obrigatória", description: "Escolha data e hora.", variant: "destructive" });
      return;
    }
    const iso = new Date(scheduleDate).toISOString();
    updatePostSchedule(schedulingId, iso);
    setScheduleOpen(false);
    toast({ title: "Post agendado", description: "Veja no Calendário." });
  };

  const publishedCount = savedPosts.filter((p) => p.status === "published").length;
  const scheduledCount = savedPosts.filter((p) => p.status === "scheduled").length;
  const draftCount = savedPosts.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Posts salvos</h2>
          <p className="text-sm text-muted-foreground">
            Conteúdos do Estúdio gravados neste navegador.
          </p>
        </div>
        {savedPosts.length > 0 && (
          <div className="hidden sm:flex items-center gap-2">
            <Badge className="bg-success/15 text-success border-success/30 gap-1">
              {publishedCount} publicados
            </Badge>
            <Badge variant="outline" className="border-primary/40 text-primary gap-1">
              {scheduledCount} agendados
            </Badge>
            <Badge variant="secondary" className="gap-1">
              {draftCount} rascunhos
            </Badge>
          </div>
        )}
      </div>

      {savedPosts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ImageOff className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Nenhum post criado ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie no Estúdio IA e clique em &quot;Salvar post&quot;.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {savedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onEdit={() => {
                loadPostIntoPreview(post.id);
                toast({ title: "Post carregado", description: "Preview atualizado." });
              }}
              onSchedule={() => openSchedule(post.id)}
              onDelete={() => {
                deleteSavedPost(post.id);
                toast({ title: "Post excluído" });
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar post</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="sched-dt">Data e hora</Label>
            <Input
              id="sched-dt"
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmSchedule}>Salvar agendamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostCard({
  post,
  onEdit,
  onSchedule,
  onDelete,
}: {
  post: MarketingSavedPost;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}) {
  const Icon = surfaceIcon(post.previewSurface);
  const dateStr = post.scheduledAt
    ? new Date(post.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : new Date(post.createdAt).toLocaleString("pt-BR", { dateStyle: "short" });
  const hashCount = post.hashtags ? post.hashtags.split(/\s+/).filter((h) => h.startsWith("#")).length : 0;

  return (
    <Card className="overflow-hidden border-border/80 transition-all hover:border-primary/30 hover:shadow-sm">
      <CardContent className="p-0">
        {/* Thumbnail + conteúdo */}
        <div className="flex gap-3 p-4">
          {/* Thumbnail maior */}
          <div
            className={cn(
              "relative h-32 w-24 shrink-0 overflow-hidden rounded-xl border",
              surfaceBg(post.previewSurface),
            )}
          >
            {post.imageUrl ? (
              <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center">
                <Icon className="h-6 w-6 text-muted-foreground/60" />
                <span className="text-[9px] leading-tight text-muted-foreground">
                  {surfaceLabel(post.previewSurface)}
                </span>
              </div>
            )}
            {/* Overlay de status na thumbnail */}
            <div className="absolute bottom-1 left-1 right-1">
              {statusBadge(post.status)}
            </div>
          </div>

          {/* Conteúdo */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Cabeçalho: plataforma */}
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                post.previewSurface === "whatsapp" ? "bg-[#075e54]/15" :
                post.previewSurface === "ad" ? "bg-primary/10" :
                "bg-gradient-to-br from-purple-500/15 to-pink-500/15"
              )}>
                <Icon className="h-3.5 w-3.5 text-foreground" />
              </div>
              <span className="text-xs font-semibold text-foreground">{surfaceLabel(post.previewSurface)}</span>
            </div>

            {/* Caption */}
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {post.caption || <span className="italic">Sem texto</span>}
            </p>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {hashCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Hash className="h-3 w-3" />{hashCount}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {post.scheduledAt ? `📅 ${dateStr}` : `🕐 ${dateStr}`}
              </span>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 border-t border-border bg-muted/20 px-3 py-2">
          <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs gap-1" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
            Editar
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-7 flex-1 text-xs gap-1" onClick={onSchedule}>
            <CalendarClock className="h-3 w-3" />
            Agendar
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-7 px-3 text-xs text-destructive/70 hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
