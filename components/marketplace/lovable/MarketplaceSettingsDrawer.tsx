"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Plug,
  RefreshCw,
  Boxes,
  Sparkles,
  Bell,
  LifeBuoy,
  ChevronRight,
  BookOpen,
  MessageCircle,
  Bug,
  HelpCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

function SectionTitle({ icon: Icon, title, desc }: { icon: any; title: string; desc?: string }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="font-display font-bold text-sm">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
    </div>
  );
}

function Row({
  title,
  desc,
  control,
}: {
  title: string;
  desc?: string;
  control?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {control}
    </div>
  );
}

function LinkRow({ icon: Icon, title, desc }: { icon: any; title: string; desc?: string }) {
  return (
    <button className="w-full flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-left hover:bg-muted/60 transition-colors">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted/60 text-foreground/80">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

export function MarketplaceSettingsDrawer({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const showPendingToast = () =>
    toast({
      title: "Integração pendente",
      description: PENDING_TOAST_DESCRIPTION,
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto bg-background border-l border-border"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-2xl">Configurações do Marketplace</SheetTitle>
          <SheetDescription>
            Ajuste contas, sincronização, automações e preferências do hub.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-8">
          {/* Contas conectadas */}
          <section>
            <SectionTitle icon={Plug} title="Contas conectadas" desc="Gerencie integrações de canais" />
            <div className="space-y-2">
              <Row
                title="Mercado Livre"
                desc="Conectado • Token válido"
                control={
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="text-xs font-medium text-primary hover:underline cursor-not-allowed opacity-80"
                  >
                    Gerenciar
                  </button>
                }
              />
              <Row
                title="Shopee"
                desc="Conectado • Sincronizando"
                control={
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="text-xs font-medium text-primary hover:underline cursor-not-allowed opacity-80"
                  >
                    Gerenciar
                  </button>
                }
              />
              <Row
                title="Amazon"
                desc="Token expirado"
                control={
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="text-xs font-medium text-destructive hover:underline cursor-not-allowed opacity-80"
                  >
                    Reconectar
                  </button>
                }
              />
              <Row
                title="Instagram"
                desc="Conectado"
                control={
                  <button
                    onClick={showPendingToast}
                    title="Integração pendente"
                    className="text-xs font-medium text-primary hover:underline cursor-not-allowed opacity-80"
                  >
                    Gerenciar
                  </button>
                }
              />
            </div>
          </section>

          {/* Sincronização */}
          <section>
            <SectionTitle icon={RefreshCw} title="Sincronização" desc="Frequência e regras de atualização" />
            <div className="space-y-2">
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Sincronização automática" desc="A cada 5 minutos em todos canais" control={<Switch defaultChecked disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Sincronizar ao publicar" desc="Envia novo produto para todos os canais ativos" control={<Switch defaultChecked disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Reprocessar falhas automaticamente" desc="Tenta novamente após 2 minutos" control={<Switch disabled />} />
              </div>
            </div>
          </section>

          {/* Regras de estoque */}
          <section>
            <SectionTitle icon={Boxes} title="Regras de estoque" desc="Controle de inventário multicanal" />
            <div className="space-y-2">
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Alertar estoque baixo" desc="Notifica quando SKU estiver com 5 unidades ou menos" control={<Switch defaultChecked disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Pausar anúncio sem estoque" desc="Despublica automaticamente em todos os canais" control={<Switch defaultChecked disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Reservar estoque por canal" desc="Distribuição inteligente entre marketplaces" control={<Switch disabled />} />
              </div>
            </div>
          </section>

          {/* Automação */}
          <section>
            <SectionTitle icon={Sparkles} title="Automação" desc="Inteligência aplicada à operação" />
            <div className="space-y-2">
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Ajuste de preço com IA" desc="Reajusta com base em margem e concorrência" control={<Switch defaultChecked disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Respostas automáticas" desc="IA responde dúvidas frequentes" control={<Switch disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Geração de descrição com IA" desc="Cria títulos e textos otimizados para SEO" control={<Switch defaultChecked disabled />} />
              </div>
            </div>
          </section>

          {/* Notificações */}
          <section>
            <SectionTitle icon={Bell} title="Notificações" desc="Como você quer ser avisado" />
            <div className="space-y-2">
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Alertas críticos por e-mail" control={<Switch defaultChecked disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Resumo diário de vendas" control={<Switch defaultChecked disabled />} />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <Row title="Push de novos pedidos" control={<Switch disabled />} />
              </div>
            </div>
          </section>

          {/* Ajuda e suporte */}
          <section>
            <SectionTitle icon={LifeBuoy} title="Ajuda e suporte" desc="Estamos aqui para ajudar" />
            <div className="space-y-2">
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <LinkRow icon={HelpCircle} title="Central de ajuda" desc="Tutoriais e perguntas frequentes" />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <LinkRow icon={MessageCircle} title="Falar com especialista" desc="Atendimento humano em até 5 min" />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <LinkRow icon={BookOpen} title="Ver documentação" desc="API, integrações e guias técnicos" />
              </div>
              <div onClick={showPendingToast} title="Integração pendente" className="cursor-not-allowed opacity-80">
                <LinkRow icon={Bug} title="Reportar problema" desc="Envie um relato detalhado ao suporte" />
              </div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
