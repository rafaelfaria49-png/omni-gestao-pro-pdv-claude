import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, LayoutGrid, Send, Bot, PenSquare, CalendarDays } from "lucide-react";
import { PhonePreview } from "./components/PhonePreview";
import { StudioPreviewProvider } from "./components/studio-preview-context";
import { MediaStudioTab } from "./components/MediaStudioTab";
import { DistributionTab } from "./components/DistributionTab";
import { PostGeneratorTab } from "./components/PostGeneratorTab";
import { CalendarTab } from "./components/CalendarTab";
import { StudioMainTab } from "./components/studio/StudioMainTab";

export default function MarketingIAHub() {
  return (
    <StudioPreviewProvider>
    <div className="relative bg-background text-foreground">
      {/* Ambient glow — fixed mas atrás de tudo */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
      </div>

      {/* Sub-header interno da página */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Marketing IA Hub</h1>
            <p className="text-xs text-muted-foreground">OmniGestão Pro · Estúdio Enterprise</p>
          </div>
        </div>
      </div>

      {/* Conteúdo principal: editor à esquerda, preview celular à direita (mobile: coluna única) */}
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Abas / editor */}
          <section className="min-w-0">
            <Tabs defaultValue="studio-ia" className="w-full">
              <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-border bg-card/60 p-1.5 backdrop-blur-md sm:grid-cols-3 lg:grid-cols-5">
                <TabsTrigger
                  value="studio-ia"
                  className="flex items-center gap-2 rounded-xl py-3 text-sm font-medium text-muted-foreground data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--color-primary)/0.2)]"
                >
                  <Sparkles className="h-4 w-4" /><span className="hidden md:inline">Estúdio IA</span>
                </TabsTrigger>
                <TabsTrigger
                  value="posts"
                  className="flex items-center gap-2 rounded-xl py-3 text-sm font-medium text-muted-foreground data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--color-primary)/0.2)]"
                >
                  <PenSquare className="h-4 w-4" /><span className="hidden md:inline">Posts</span>
                </TabsTrigger>
                <TabsTrigger
                  value="studio"
                  className="flex items-center gap-2 rounded-xl py-3 text-sm font-medium text-muted-foreground data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--color-primary)/0.2)]"
                >
                  <LayoutGrid className="h-4 w-4" /><span className="hidden md:inline">Estúdio</span>
                </TabsTrigger>
                <TabsTrigger
                  value="calendar"
                  className="flex items-center gap-2 rounded-xl py-3 text-sm font-medium text-muted-foreground data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--color-primary)/0.2)]"
                >
                  <CalendarDays className="h-4 w-4" /><span className="hidden md:inline">Calendário</span>
                </TabsTrigger>
                <TabsTrigger
                  value="dist"
                  className="flex items-center gap-2 rounded-xl py-3 text-sm font-medium text-muted-foreground data-[state=active]:!bg-primary data-[state=active]:!text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--color-primary)/0.2)]"
                >
                  <Send className="h-4 w-4" /><span className="hidden md:inline">Distribuição</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="studio-ia"><StudioMainTab /></TabsContent>
              <TabsContent value="posts"><PostGeneratorTab /></TabsContent>
              <TabsContent value="studio"><MediaStudioTab /></TabsContent>
              <TabsContent value="calendar"><CalendarTab /></TabsContent>
              <TabsContent value="dist"><DistributionTab /></TabsContent>
            </Tabs>
          </section>

          {/* Preview celular */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="mb-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Pré-visualização em tempo real
              </p>
              <h3 className="mt-1 text-xl font-bold text-primary">Instagram · WhatsApp · Anúncio</h3>
            </div>
            <PhonePreview />
          </aside>
        </div>
      </div>
    </div>
    </StudioPreviewProvider>
  );
}
