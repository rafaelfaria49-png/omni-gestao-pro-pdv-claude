import "./pdv-original-scope.css"

/**
 * Layout isolado — mini-app standalone do PDV GitHub Original.
 *
 * Esta rota foi bypassada em `app/dashboard/layout.tsx`, então NÃO recebe:
 *   - AppShell (Sidebar/Topbar)
 *   - AccessGate
 *   - AppOpsProviders (caixa, operations store, perfil-loja, …)
 *
 * Os únicos wrappers globais que sobram são os do `app/layout.tsx` raiz
 * (obrigatório em Next.js): <html>, <body>, ThemeProvider (= StudioThemeProvider).
 *
 * O isolamento visual é completo via:
 *   1. `pdv-original-scope.css` (importado aqui) — tokens .black-edition do reference,
 *      `--radius: 0.75rem`, cancela `data-density="operational"`.
 *   2. `PdvGithubOriginal` wrappa o subtree em `<StudioThemeContext.Provider value={{mode:"black",…}}>`
 *      forçando o shell para o branch isBlackEdition=true / inkUi=true (chrome #000 hardcoded).
 */
export default function PdvGithubOriginalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
