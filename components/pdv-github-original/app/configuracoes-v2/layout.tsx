import type { ReactNode } from "react";

/**
 * Rota full-screen para Configurações V2 (sem AppShell do dashboard).
 * Nota Next.js: não se pode aninhar <html>/<body> aqui — isso existe só no root layout.
 * Este segmento fica fora de app/dashboard/*, por isso não herda sidebar/header do painel.
 */
export default function ConfiguracoesV2RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <div className="min-h-screen w-full">{children}</div>;
}
