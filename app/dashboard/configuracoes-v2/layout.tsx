import type { ReactNode } from "react";

export default function ConfiguracoesV2Layout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {children}
    </div>
  );
}
