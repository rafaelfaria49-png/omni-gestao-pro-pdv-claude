import { CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/configuracoes-v3/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const Icon =
          variant === "destructive" ? OctagonAlert : variant === "success" ? CheckCircle2 : Info;
        const iconColor =
          variant === "destructive"
            ? "var(--cfg-danger-fg)"
            : variant === "success"
              ? "var(--cfg-success-fg)"
              : "var(--cfg-info-fg)";

        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: iconColor }}
                aria-hidden="true"
              />
              <div className="grid min-w-0 gap-0.5">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
