"use client";

import { useState } from "react";
import {
  Instagram,
  Music2,
  Facebook,
  MessageCircle,
  Droplets,
  Send,
  Sparkles,
  Inbox,
  Palette,
  Plus,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStudioPreview } from "./studio-preview-context";
import type { ConnectedAccount } from "../lib/marketing-ia-types";

type NetKey = ConnectedAccount["network"];

const NETWORKS: Array<{
  key: NetKey;
  label: string;
  desc: string;
  icon: typeof Instagram;
  placeholder: string;
}> = [
  {
    key: "instagram",
    label: "Instagram",
    desc: "Reels, Stories e Feed",
    icon: Instagram,
    placeholder: "@sua.conta",
  },
  {
    key: "tiktok",
    label: "TikTok",
    desc: "Vídeos verticais",
    icon: Music2,
    placeholder: "@sua.conta",
  },
  {
    key: "facebook",
    label: "Facebook",
    desc: "Feed e Stories",
    icon: Facebook,
    placeholder: "Página comercial",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    desc: "Status e transmissão",
    icon: MessageCircle,
    placeholder: "+55 11 9...",
  },
];

const INBOX = [
  {
    name: "Mariana C.",
    channel: "Instagram",
    msg: "Tem essa jaqueta no tamanho M ainda?",
    suggestion:
      "Oi Mariana! Sim, temos 4 unidades no M em estoque 💙 Quer que eu reserve?",
  },
  {
    name: "Carlos R.",
    channel: "WhatsApp",
    msg: "Vocês entregam no centro hoje?",
    suggestion:
      "Olá Carlos! Sim, entregamos no centro até 18h se o pedido for até 14h ✅",
  },
  {
    name: "Júlia P.",
    channel: "TikTok",
    msg: "Onde compro? 😍",
    suggestion: "Oi Júlia! Link na bio + temos cupom BEMVINDA10 pra você 💚",
  },
];

export function DistributionTab() {
  const [watermark, setWatermark] = useState(true);
  const [brand, setBrand] = useState(true);
  const { connectedAccounts, setConnectedAccounts, publishNowSimulated } = useStudioPreview();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [newNetwork, setNewNetwork] = useState<NetKey>("instagram");
  const [newUsername, setNewUsername] = useState("");

  const accountsFor = (key: NetKey) => connectedAccounts.filter((a) => a.network === key);

  const confirmAdd = () => {
    const u = newUsername.trim();
    if (!u) {
      toast({ title: "Informe o usuário ou nome", variant: "destructive" });
      return;
    }
    setConnectedAccounts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), network: newNetwork, username: u },
    ]);
    setAddOpen(false);
    toast({ title: "Conta adicionada (local)", description: "Dados salvos neste navegador." });
  };

  const removeById = (id: string) => {
    setConnectedAccounts((prev) => prev.filter((a) => a.id !== id));
    toast({ title: "Conta removida" });
  };

  const handlePublishNow = () => {
    const r = publishNowSimulated();
    if (!r.ok) {
      toast({
        title: "Crie ou selecione um post primeiro",
        description: "Use o Estúdio IA ou abra um post salvo.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Publicação simulada com sucesso",
      description: r.markedPublished
        ? "Post salvo marcado como publicado. Integração real com redes será adicionada depois."
        : "Função simulada por enquanto. Salve o post para registrar publicação no histórico.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 animate-fade-in-up">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-gradient-primary p-3 text-primary-foreground shadow-glow">
            <Palette className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-foreground">Configuração de Marca</h2>
            <p className="text-base text-muted-foreground">
              Aplicar cores e logo da loja automaticamente em cada peça publicada.
            </p>
          </div>
          <Switch checked={brand} onCheckedChange={setBrand} />
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 animate-fade-in-up [animation-delay:80ms]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Contas conectadas</h2>
            <p className="mt-1 text-base text-muted-foreground">
              Instagram, TikTok, Facebook e WhatsApp — armazenamento local (simulado).
            </p>
          </div>
          <Badge className="bg-gradient-primary text-primary-foreground border-0">
            <Sparkles className="mr-1 h-3 w-3" /> {connectedAccounts.length} contas
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {NETWORKS.map(({ key, label, desc, icon: Icon, placeholder }) => {
            const list = accountsFor(key);
            return (
              <div
                key={key}
                className="rounded-xl border border-border bg-card/60 p-4 transition-all hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2.5 text-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground">{label}</p>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {list.length} {list.length === 1 ? "conta" : "contas"}
                  </Badge>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNewNetwork(key);
                    setNewUsername("");
                    setAddOpen(true);
                  }}
                  className="btn-glow mt-4 w-full gap-2 border-dashed border-primary/40 text-primary hover:bg-muted/50"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar conta
                </Button>

                <div className="mt-3 space-y-2">
                  {list.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                      Nenhuma conta conectada ainda.
                    </p>
                  )}
                  {list.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        <p className="truncate text-sm font-medium text-foreground">{acc.username}</p>
                        <Badge variant="outline" className="border-success/40 text-[10px] text-success">
                          Ativa
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeById(acc.id)}
                        aria-label={`Remover ${acc.username}`}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-4 rounded-xl border border-dashed border-border bg-gradient-hero p-4">
          <div className="rounded-lg bg-muted p-2.5 text-primary">
            <Droplets className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-foreground">Aplicar marca d&apos;água da loja</p>
            <p className="text-sm text-muted-foreground">Logo discreto no canto inferior direito.</p>
          </div>
          <Switch checked={watermark} onCheckedChange={setWatermark} />
        </div>

        <Button
          className="btn-glow mt-5 w-full gap-2 bg-gradient-primary py-6 text-base text-primary-foreground hover:opacity-95 shadow-glow"
          onClick={handlePublishNow}
        >
          <Send className="h-5 w-5" /> Publicar agora
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Rede</Label>
              <Select value={newNetwork} onValueChange={(v) => setNewNetwork(v as NetKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NETWORKS.map((n) => (
                    <SelectItem key={n.key} value={n.key}>
                      {n.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-user">Nome / usuário</Label>
              <Input
                id="acc-user"
                placeholder={NETWORKS.find((n) => n.key === newNetwork)?.placeholder}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmAdd}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="glass-card rounded-2xl p-6 animate-fade-in-up [animation-delay:160ms]">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-primary p-2.5 text-primary-foreground shadow-glow">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Central de Mensagens</h2>
            <p className="text-base text-muted-foreground">
              Respostas sugeridas (demonstração). Integração real depois.
            </p>
          </div>
          <Badge variant="outline" className="ml-auto border-success/40 text-success">
            {INBOX.length} novos
          </Badge>
        </div>

        <div className="mt-5 space-y-3">
          {INBOX.map((m, i) => (
            <div
              key={m.name}
              style={{ animationDelay: `${200 + i * 80}ms` }}
              className="rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-primary/40 animate-fade-in-up"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow">
                    {m.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">via {m.channel}</p>
                  </div>
                </div>
                <Badge variant="outline">há 2 min</Badge>
              </div>
              <p className="mt-3 rounded-lg bg-muted/60 p-3 text-base text-foreground">&ldquo;{m.msg}&rdquo;</p>
              <div className="mt-3 rounded-lg border border-primary/30 bg-muted/50 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3 w-3" /> Sugestão de resposta (simulada)
                </div>
                <p className="text-base text-foreground">{m.suggestion}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="btn-glow bg-gradient-primary text-primary-foreground hover:opacity-95"
                    onClick={() =>
                      toast({
                        title: "Função simulada",
                        description: "Envio real será integrado depois.",
                      })
                    }
                  >
                    Enviar
                  </Button>
                  <Button size="sm" variant="outline">
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground">
                    Ignorar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
