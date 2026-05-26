"use client";

import { useEffect, useState } from "react";
import { Check, FileSpreadsheet, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImportadorDadosExternos } from "@/components/dashboard/configuracoes/backup-importador/importador-dados-externos";
import { ImportadorAvancado } from "@/components/dashboard/configuracoes/importador-avancado/ImportadorAvancado";
import { SectionHeader } from "../components/SectionHeader";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { UnidadeAtivaRequiredBanner } from "../components/UnidadeAtivaRequiredBanner";
import {
  LEGACY_GLOBAL_IMPORTACAO_MODO_KEY,
  readStoreScopedString,
  STORE_SCOPED_IMPORTACAO_MODO_KEY,
  writeStoreScopedString,
} from "@/lib/store-scoped-storage";

type ModoImportacao = "universal" | "avancada";

const DEFAULT_MODO: ModoImportacao = "universal";

function readModoStorage(storeId: string | null | undefined): ModoImportacao {
  const raw = readStoreScopedString(
    STORE_SCOPED_IMPORTACAO_MODO_KEY,
    storeId,
    LEGACY_GLOBAL_IMPORTACAO_MODO_KEY,
  );
  if (raw === "universal" || raw === "avancada") return raw;
  return DEFAULT_MODO;
}

function writeModoStorage(storeId: string | null | undefined, modo: ModoImportacao) {
  writeStoreScopedString(STORE_SCOPED_IMPORTACAO_MODO_KEY, storeId, modo);
}

type CardModo = {
  id: ModoImportacao;
  name: string;
  description: string;
  bullets: string[];
  icon: typeof FileSpreadsheet;
};

const CARDS: CardModo[] = [
  {
    id: "universal",
    name: "Importação Universal",
    description:
      "Modo guiado: um arquivo por vez, com mapeamento manual de colunas e modelos prontos para baixar.",
    bullets: [
      "Clientes, produtos, financeiro, vendas e ordens",
      "Modelos XLSX oficiais do OmniGestão",
      "Validação coluna a coluna antes de gravar",
    ],
    icon: FileSpreadsheet,
  },
  {
    id: "avancada",
    name: "Importação Avançada",
    description:
      "Cruzamento automático: vários arquivos (ou um ZIP) ao mesmo tempo, com detecção de domínio e preview antes do import.",
    bullets: [
      "Suporte ao ZIP de exportação do GestaoClick",
      "Detecção automática + confiança por planilha",
      "Auditoria por domínio pós-importação",
    ],
    icon: Wand2,
  },
];

export function ImportacaoSection() {
  const { lojaAtivaId } = useLojaAtiva();
  const storeId = lojaAtivaId?.trim() ?? "";
  const noLoja = !storeId;

  const [modo, setModo] = useState<ModoImportacao>(DEFAULT_MODO);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!storeId) {
      setModo(DEFAULT_MODO);
      setHydrated(true);
      return;
    }
    setModo(readModoStorage(storeId));
    setHydrated(true);
  }, [storeId]);

  const selecionar = (next: ModoImportacao) => {
    if (!storeId) return;
    setModo(next);
    writeModoStorage(storeId, next);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Upload className="h-5 w-5" />}
        title="Importação de Dados"
        description="Preferência de modo salva por unidade neste navegador. Os dados importados vão sempre para a loja ativa."
      />

      {noLoja ? (
        <UnidadeAtivaRequiredBanner hint="Importações exigem unidade ativa — dados nunca cruzam lojas." />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const active = hydrated && modo === card.id;
          return (
            <div
              key={card.id}
              className={cn(
                "relative flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-all",
                active
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/40 hover:shadow-md",
              )}
            >
              {active && (
                <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Check className="h-4 w-4" />
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-snug text-foreground">{card.name}</h3>
                  <p className="mt-0.5 text-sm font-normal leading-relaxed text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {card.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                        active ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                      aria-hidden
                    />
                    <span className="text-foreground/80">{b}</span>
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                size="sm"
                variant={active ? "secondary" : "default"}
                disabled={active || noLoja}
                onClick={() => selecionar(card.id)}
                className="w-full"
              >
                {active ? "Selecionado" : "Usar este modo"}
              </Button>
            </div>
          );
        })}
      </div>

      {!noLoja ? (
        <div key={storeId}>
          {modo === "avancada" ? <ImportadorAvancado /> : <ImportadorDadosExternos />}
        </div>
      ) : null}
    </div>
  );
}
