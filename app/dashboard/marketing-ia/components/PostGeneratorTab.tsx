"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Copy,
  Check,
  Instagram,
  MessageCircle,
  Music2,
  Facebook,
  Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Network = "instagram" | "whatsapp" | "tiktok" | "facebook";
type Tone = "persuasivo" | "divertido" | "urgente";

const MOCKS: Record<Network, Record<Tone, string>> = {
  instagram: {
    persuasivo:
      "✨ Você merece o melhor — e ele acabou de chegar.\n\nNossa nova coleção foi pensada para quem não aceita menos do que excelência. Materiais premium, design exclusivo e aquele toque que faz toda a diferença.\n\n👉 Garanta o seu agora pelo link da bio. Estoque limitado!\n\n#novidade #premium #lancamento #estilo",
    divertido:
      "Alerta: produto novo na área 🚨🎉\n\nPrepara o coração (e o carrinho 🛒) porque chegou aquela novidade que vai bombar o seu feed!\n\nMarca aquela amiga que PRECISA ver isso 👇\n\n#vemver #novidade #amei #goals",
    urgente:
      "⏰ ÚLTIMAS UNIDADES! ⏰\n\nA promoção mais esperada do mês acaba HOJE às 23:59. Não fique de fora — quem deixou pra depois, ficou sem.\n\n🔥 Corre pro link da bio AGORA.\n\n#promocao #ultimasunidades #correle",
  },
  whatsapp: {
    persuasivo:
      "Olá! 👋 Tudo bem?\n\nSeparei uma novidade que combina muito com você. É um item que está saindo bastante e tenho certeza que vai amar.\n\nPosso te enviar mais detalhes e fotos? 😊",
    divertido:
      "Oieee! 💛 Adivinha o que chegou? 👀\n\nAquela novidade que você tava esperando! Já tá disponível e tô passando aqui só pra te avisar em primeira mão 🥳\n\nQuer dar uma espiadinha?",
    urgente:
      "🚨 Aviso rápido!\n\nA promoção que comentei termina HOJE. Restam pouquíssimas unidades e não quero que você perca.\n\nPosso reservar a sua agora? ✅",
  },
  tiktok: {
    persuasivo:
      "POV: você finalmente encontrou o produto perfeito 🤌\n\n✅ Qualidade premium\n✅ Design único\n✅ Preço que cabe no bolso\n\nLink na bio 🔗\n\n#fyp #achadinhos #pov #viral",
    divertido:
      "Ninguém:\nAbsolutamente ninguém:\nEu chegando com o lançamento do mês 💅✨\n\nSalva esse vídeo pra não esquecer 📌\n\n#fyp #foryou #trend #viralizou",
    urgente:
      "PARA TUDO 🛑 Última chamada!\n\nAcaba hoje e eu não vou avisar de novo 🫠\n\nCorre, corre, corre pro link da bio 🏃‍♀️💨\n\n#fyp #ultimodia #promo",
  },
  facebook: {
    persuasivo:
      "Novidade na loja! ✨\n\nSelecionamos uma oferta especial para quem acompanha nossa página: produto premium, acabamento impecável e pronta entrega.\n\nClique em Saiba Mais ou chame no Messenger para reservar o seu hoje.",
    divertido:
      "Passando no seu feed pra avisar: chegou novidade boa! 🎉\n\nÉ aquele tipo de produto que dá vontade de marcar todo mundo. Curtiu? Comenta EU QUERO que a gente te chama com os detalhes!",
    urgente:
      "Última chamada no Facebook! 🚨\n\nA campanha termina hoje e restam poucas unidades. Garanta pelo inbox ou clique em Saiba Mais antes que acabe.",
  },
};

const NETWORK_META: Record<Network, { label: string; icon: typeof Instagram }> = {
  instagram: { label: "Instagram", icon: Instagram },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  tiktok: { label: "TikTok", icon: Music2 },
  facebook: { label: "Facebook Feed e Stories", icon: Facebook },
};

export const PostGeneratorTab = () => {
  const { toast } = useToast();
  const [network, setNetwork] = useState<Network>("instagram");
  const [tone, setTone] = useState<Tone>("persuasivo");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setLoading(true);
    setResult(null);
    setCopied(false);
    setTimeout(() => {
      const base = MOCKS[network][tone];
      const final = topic.trim()
        ? `${base}\n\n— Sobre: ${topic.trim()}`
        : base;
      setResult(final);
      setLoading(false);
    }, 1400);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast({ title: "Copiado!", description: "Conteúdo na sua área de transferência." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const NetworkIcon = NETWORK_META[network].icon;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Credits badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Gerador de Posts
          </h2>
          <p className="text-base text-muted-foreground">
            Crie conteúdo persuasivo em segundos com IA.
          </p>
        </div>
        <Badge
          variant="outline"
          className="gap-2 border-primary/40 bg-muted/50 px-4 py-2 text-sm font-semibold text-foreground shadow-glow"
        >
          <span className="text-base">⚡</span>
          Saldo Premium: <span className="neon-text">800 Créditos</span>
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: Configuration */}
        <Card className="glass-card animate-scale-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Wand2 className="h-5 w-5 text-primary" />
              Configuração do Post
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-base font-medium">Rede Social</Label>
              <Select value={network} onValueChange={(v) => setNetwork(v as Network)}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">📸 Instagram</SelectItem>
                  <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                  <SelectItem value="tiktok">🎵 TikTok</SelectItem>
                  <SelectItem value="facebook">📘 Facebook Feed e Stories</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Tom de Voz</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="persuasivo">🎯 Persuasivo</SelectItem>
                  <SelectItem value="divertido">🎉 Divertido</SelectItem>
                  <SelectItem value="urgente">⚡ Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Sobre o que é o post?</Label>
              <Textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex: Lançamento da nova coleção de inverno com 30% de desconto até domingo..."
                className="min-h-[140px] text-base"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading}
              size="lg"
              className="btn-glow w-full bg-gradient-primary text-base font-semibold text-primary-foreground hover:opacity-95"
            >
              <Sparkles className="h-5 w-5" />
              {loading ? "Gerando conteúdo..." : "Gerar Conteúdo"}
            </Button>
          </CardContent>
        </Card>

        {/* RIGHT: Result */}
        <Card className="glass-card animate-scale-in">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-xl">
              <NetworkIcon className="h-5 w-5 text-primary" />
              Resultado · {NETWORK_META[network].label}
            </CardTitle>
            {result && !loading && (
              <Button
                onClick={handleCopy}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-success" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copiar
                  </>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-5/6" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-4/5" />
              </div>
            )}

            {!loading && result && (
              <div className="rounded-xl border border-border bg-background/40 p-5">
                <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground">
                  {result}
                </pre>
              </div>
            )}

            {!loading && !result && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                <Sparkles className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-base font-medium text-foreground">
                  Seu conteúdo aparecerá aqui
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure ao lado e clique em Gerar Conteúdo
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
