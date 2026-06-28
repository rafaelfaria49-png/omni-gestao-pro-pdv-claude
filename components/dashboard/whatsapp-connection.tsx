import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * LEGACY_QUARANTINED: não montar em produção; não executa venda; mantido apenas
 * como referência histórica até remoção.
 *
 * Contexto (GOAL WHATSAPP-LEGACY-QUARANTINE-001 · auditoria PDV-WHATSAPP-SALE-AUDIT-001):
 * a versão anterior deste componente expunha um "robô de comando" por voz/texto que
 * chamava `finalizeSaleTransaction({ ..., openCaixaIfClosed: true })` — podendo VENDER,
 * BAIXAR ESTOQUE e ABRIR CAIXA automaticamente fora do fluxo oficial de PDV (e sem
 * `SessaoCaixa` servidor). Era o único ponto do código com `openCaixaIfClosed: true`.
 *
 * O atendimento WhatsApp atual é o `components/whatsapp/WhatsAppOperationalHub.tsx`
 * (assistido / somente leitura): NÃO finaliza venda, NÃO baixa estoque, NÃO abre caixa.
 *
 * Esta implementação foi NEUTRALIZADA: não importa `operations-store`, não chama
 * `finalizeSaleTransaction`, não usa `openCaixaIfClosed`, não abre caixa, não baixa
 * estoque, não cria O.S., não envia WhatsApp e não tem nenhum efeito colateral.
 * Renderiza apenas um aviso estático. O export é preservado só para não quebrar algum
 * import remanescente — hoje o componente está órfão (nenhuma rota/menu o monta).
 */
export function WhatsAppConnection() {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          Conexão WhatsApp (legado desativado)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Este painel legado foi desativado por segurança. Ele não executa nenhuma ação —
          não finaliza venda, não baixa estoque e não abre caixa.
        </p>
        <p>
          O atendimento de WhatsApp acontece no HUB oficial (assistido e somente leitura).
          Acesse <span className="font-medium text-foreground">Dashboard → WhatsApp</span>.
        </p>
      </CardContent>
    </Card>
  )
}
