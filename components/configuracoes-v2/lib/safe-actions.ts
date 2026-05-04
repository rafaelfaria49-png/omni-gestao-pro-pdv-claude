import { toast } from "@/components/configuracoes-v2/hooks/settings-toast";

export const PENDING_TOAST_DESCRIPTION =
  "Funcionalidade em preparação. Integração real será ativada nas próximas etapas.";

export function toastPending() {
  toast({
    title: "Integração pendente",
    description: PENDING_TOAST_DESCRIPTION,
  });
}
