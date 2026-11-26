"use client";

/**
 * Ações de impressão que NÃO gravam nada: teste pela ponte TCP (plataforma) e prévia pela impressão do navegador
 * (cliente). Mesma lógica da antiga `ImpressaoPdvSettingsCard`.
 */
import { useState } from "react";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import type { PdvImpressaoConfig } from "@/lib/pdv-impressao-config";
import { buildPdvReceiptEscPos } from "@/lib/escpos";
import { sendEscPosViaProxy } from "@/lib/thermal-print";
import { printPdvSaleReceipt } from "@/lib/pdv-print-runtime";
import { configPadrao } from "@/lib/config-empresa";
import { normalizeImpressao } from "./pdv-station-model";

export function usePrintActions(imp: PdvImpressaoConfig) {
  const { toast } = useToast();
  const { lojaAtivaRaw } = useLojaAtiva();
  const { settings } = useStoreSettings();
  const [testing, setTesting] = useState(false);

  const testNetwork = async () => {
    setTesting(true);
    try {
      const bytes = buildPdvReceiptEscPos(
        {
          nomeFantasia: configPadrao.empresa.nomeFantasia,
          cnpj: configPadrao.empresa.cnpj,
          itens: [{ name: "Teste de impressão", quantity: 1, unitPrice: 1, lineTotal: 1 }],
          subtotal: 1,
          taxes: 0,
          discount: 0,
          total: 1,
          dataHora: new Date().toLocaleString("pt-BR"),
          receiptFooter: imp.rodapeCupom.trim() || "Teste OmniGestão — configurações PDV",
        },
        { modo: imp.comprovanteModo, maxChars: imp.bobinaTamanho === "58mm" ? 32 : 48 },
      );
      const host = imp.impressoraHost.trim();
      const res = await sendEscPosViaProxy(bytes, host ? { host, port: imp.impressoraPorta } : undefined);
      if (res.ok) toast({ title: "Teste enviado", description: "Cupom de teste enviado à impressora (TCP/raw)." });
      else
        toast({
          title: "Impressora não respondeu",
          description: `${res.error}. Confira o host e a porta ou o THERMAL_PRINT_HOST do servidor.`,
          variant: "destructive",
        });
    } finally {
      setTesting(false);
    }
  };

  /** Prévia explícita pelo mesmo HTML do cupom; não chama a ponte TCP nem grava venda. */
  const browserPreview = async () => {
    const result = await printPdvSaleReceipt({
      config: normalizeImpressao(imp),
      receiptFooter: settings?.receiptFooter ?? null,
      logoUrl: lojaAtivaRaw?.logoUrl ?? null,
      forceBrowserFallback: true,
      input: {
        nomeFantasia: lojaAtivaRaw?.nomeFantasia?.trim() || "Sua loja",
        cnpj: lojaAtivaRaw?.cnpj?.trim() || "—",
        itens: [{ name: "PRÉVIA — sem valor fiscal", quantity: 1, unitPrice: 0, lineTotal: 0 }],
        subtotal: 0,
        taxes: 0,
        discount: 0,
        total: 0,
        dataHora: new Date().toLocaleString("pt-BR"),
      },
    });
    if (!result.ok) toast({ title: "Prévia indisponível", description: result.error, variant: "destructive" });
  };

  return { testing, testNetwork, browserPreview };
}
