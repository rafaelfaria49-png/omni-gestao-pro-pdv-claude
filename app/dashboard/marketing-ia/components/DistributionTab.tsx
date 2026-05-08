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
  { key: "instagram", label: "Instagram",  desc: "Reels, Stories e Feed",    icon: Instagram,      placeholder: "@sua.conta" },
  { key: "tiktok",    label: "TikTok",     desc: "Vídeos verticais",          icon: Music2,         placeholder: "@sua.conta" },
  { key: "facebook",  label: "Facebook",   desc: "Feed e Stories",            icon: Facebook,       placeholder: "Página comercial" },
  { key: "whatsapp",  label: "WhatsApp",   desc: "Status e transmissão",      icon: MessageCircle,  placeholder: "+55 11 9..." },
];

const INBOX = [
  { name: "Mariana C.", channel: "Instagram", msg: "Tem essa jaqueta no tamanho M ainda?",       suggestion: "Oi Mariana! Sim, temos 4 unidades no M em estoque 💙 Quer que eu reserve?" },
  { name: "Carlos R.",  channel: "WhatsApp",  msg: "Vocês entregam no centro hoje?",             suggestion: "Olá Carlos! Sim, entregamos no centro até 18h se o pedido for até 14h ✅" },
  { name: "Júlia P.",   channel: "TikTok",   msg: "Onde compro? 😍",                             suggestion: "Oi Júlia! Link na bio + temos cupom BEMVINDA10 pra você 💚" },
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
    setNewUsername("");
  };

  const removeById = (id: string) => {
    setConnectedAccounts((prev) => prev.filter((a) => a.id !== id));
    toast({ title: "Conta removida" });
  };

  const handlePublishNow = () => {
    const r = publishNowSimulated();
    if (!r.ok) {
      toast({ title: "Crie ou selecione um post primeiro", description: "Use o Estúdio IA ou abra um post salvo.", variant: "destructive" });
      return;
    }
    toast({
      title: "Publicação simulada com sucesso",
      description: r.markedPublished
        ? "Post marcado como publicado. Integração real será adicionada depois."
        : "Função simulada. Salve o post para registrar no histórico.",
    });
  };

  return (
    <div className="space-y-5">
      {/* Configuração de Marca */}
      <div className="glass-card rounded-2xl p-5 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-primary p-2.5 text-primary-foreground shadow-glow shrink-0">
            <Palette className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">Configuração de Marca</h2>
            <p className="text-xs text-muted-foreground">
              Aplicar cores e logo da loja automaticamente em cada peça publicada.
            </p>
          </div>
          <Switch checked={brand} onCheckedChange={setBrand} />
        </div>
      </div>

      {/* Contas conectadas */}
      <div className="glass-card rounded-2xl p-5 animate-fade-in-up [animation-delay:60ms]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Contas conectadas</h2>
            <p className="text-xs text-muted-foreground">
              Armazenamento local (simulado) — integração real em breve.
            </p>
          </div>
          <Badge className="bg-gradient-primary text-primary-foreground border-0 text-[10px]">
            <Sparkles className="mr-1 h-2.5 w-2.5" /> {connectedAccounts.length} contas
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {NETWORKS.map(({ key, label, desc, icon: Icon, placeholder }) => {
            const list = accountsFor(key);
            return (
              <div
                key={key}
                className="rounded-xl border border-border bg-card/60 p-3.5 transition-all hover:border-primary/30"
              >
                {/* Cabeçalho da rede */}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="rounded-lg bg-muted p-2 text-foreground shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {list.length}
                  </Badge>
                </div>

                {/* Contas desta rede */}
                <div className="space-y-1.5 mb-2.5">
                  {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-muted/30 py-2 text-center text-[11px] text-muted-foreground">
                      Nenhuma conta ainda
                    </p>
                  ) : (
                    list.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-2.5 py-1.5"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                          <p className="truncate text-xs font-medium text-foreground">{acc.username}</p>
                          <Badge variant="outline" className="border-success/40 text-[9px] text-success h-4">Ativa</Badge>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeById(acc.id)}
                          aria-label={`Remover ${acc.username}`}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setNewNetwork(key); setNewUsername(""); setAddOpen(true); }}
                  className="w-full gap-1.5 border-dashed border-primary/30 text-primary text-xs hover:bg-muted/50 h-7"
                >
                  <Plus className="h-3 w-3" /> Adicionar conta
                </Button>
              </div>
            );
          })}
        </div>

        {/* Marca d'água */}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-3.5">
          <div className="rounded-lg bg-muted p-2 text-primary shrink-0">
            <Droplets className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Marca d&apos;água da loja</p>
            <p className="text-[11px] text-muted-foreground">Logo discreto no canto inferior direito.</p>
          </div>
          <Switch checked={watermark} onCheckedChange={setWatermark} />
        </div>

        {/* Botão publicar */}
        <Button
          className="btn-glow mt-4 w-full gap-2 bg-gradient-primary py-3 text-sm text-primary-foreground hover:opacity-95 shadow-glow"
          onClick={handlePublishNow}
        >
          <Send className="h-4 w-4" /> Publicar agora
        </Button>
      </div>

      {/* Central de Mensagens */}
      <div className="glass-card rounded-2xl p-5 animate-fade-in-up [animation-delay:120ms]">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-xl bg-gradient-primary p-2.5 text-primary-foreground shadow-glow shrink-0">
            <Inbox className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-foreground">Central de Mensagens</h2>
            <p className="text-xs text-muted-foreground">
              Respostas sugeridas por IA (demonstração).
            </p>
          </div>
          <Badge variant="outline" className="border-success/40 text-success text-[10px] shrink-0">
            {INBOX.length} novos
          </Badge>
        </div>

        <div className="space-y-3">
          {INBOX.map((m, i) => (
            <div
              key={m.name}
              style={{ animationDelay: `${180 + i * 60}ms` }}
              className="rounded-xl border border-border bg-card/50 p-3.5 transition-all hover:border-primary/30 animate-fade-in-up"
            >
              {/* Remetente */}
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground shadow-glow shrink-0">
                  {m.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground">via {m.channel}</p>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">há 2 min</Badge>
              </div>

              {/* Mensagem */}
              <p className="mt-2.5 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground">
                &ldquo;{m.msg}&rdquo;
              </p>

              {/* Sugestão IA */}
              <div className="mt-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                  <Sparkles className="h-3 w-3" /> Sugestão (simulada)
                </div>
                <p className="text-xs text-foreground leading-relaxed">{m.suggestion}</p>
                <div className="mt-2.5 flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-gradient-primary text-primary-foreground hover:opacity-95 gap-1"
                    onClick={() => toast({ title: "Função simulada", description: "Envio real será integrado depois." })}
                  >
                    <Send className="h-3 w-3" /> Enviar
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Editar</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground">Ignorar</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dialog adicionar conta */}
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
                    <SelectItem key={n.key} value={n.key}>{n.label}</SelectItem>
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
                onKeyDown={(e) => e.key === "Enter" && confirmAdd()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAdd}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
