"use client";

import { useState } from "react";
import { CalendarClock, Pencil, Trash2, Instagram, MessageCircle, Megaphone } from "lucide-react";
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

function statusBadge(status: PostStatus) {
  switch (status) {
    case "published":
      return <Badge className="bg-success/15 text-success border-success/30">Publicado</Badge>;
    case "scheduled":
      return <Badge variant="outline" className="border-primary/40 text-primary">Agendado</Badge>;
    default:
      return <Badge variant="secondary">Rascunho</Badge>;
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Posts salvos</h2>
        <p className="text-sm text-muted-foreground">
          Conteúdos do Estúdio gravados neste navegador. Editar carrega no preview à direita.
        </p>
      </div>

      {savedPosts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum post salvo ainda. Crie no Estúdio IA e clique em &quot;Salvar post&quot;.
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
  const short = post.caption.length > 90 ? `${post.caption.slice(0, 88)}…` : post.caption;
  const dateStr = post.scheduledAt
    ? new Date(post.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : new Date(post.createdAt).toLocaleString("pt-BR", { dateStyle: "short" });

  return (
    <Card className="overflow-hidden border-border/80">
      <CardContent className="p-0">
        <div className="flex gap-3 p-3">
          <div
            className={cn(
              "relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted",
              post.previewSurface === "whatsapp" && "bg-[#075e54]/20",
              post.previewSurface === "ad" && "bg-primary/10",
            )}
          >
            {post.imageUrl ? (
              <img src={post.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-1 text-center text-[8px] text-muted-foreground">
                sem img
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{surfaceLabel(post.previewSurface)}</span>
              {statusBadge(post.status)}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{short}</p>
            <p className="text-[10px] text-muted-foreground">{post.scheduledAt ? `Agendado: ${dateStr}` : `Criado: ${dateStr}`}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border bg-muted/30 px-2 py-2">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onEdit}>
            <Pencil className="mr-1 h-3 w-3" />
            Editar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onSchedule}>
            <CalendarClock className="mr-1 h-3 w-3" />
            Agendar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1 h-3 w-3" />
            Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
