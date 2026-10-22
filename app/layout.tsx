import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { LegibilityProvider } from '@/components/theme/LegibilityProvider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'
import { APP_DISPLAY_NAME } from '@/lib/app-brand'
import { SessionProvider } from '@/components/auth/SessionProvider'
import { auth } from '@/auth'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { canAccessPage } from '@/lib/auth/page-access'
import { getPermissionsFromSession } from '@/lib/auth/enterprise-permissions'
import { ASSISTEC_ACTIVE_STORE_COOKIE } from '@/lib/store-defaults'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const appUrl =
  process.env.VERCEL_URL != null
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL?.trim() || undefined

export const metadata: Metadata = {
  metadataBase: appUrl ? new URL(appUrl) : undefined,
  applicationName: APP_DISPLAY_NAME,
  title: `${APP_DISPLAY_NAME} — Sistema de Gestão`,
  description:
    'ERP completo para varejo, supermercados, lojas de variedades e gestão empresarial.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/omni-gestao-pro-icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: APP_DISPLAY_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    /* Preto ardósia profundo (alinhado ao dark do app) */
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()
  const path = (await headers()).get('x-omni-pathname') || '/'
  const isPublic = path === '/' || path === '/privacy' || path === '/suporte' ||
    path.startsWith('/login') || path === '/portal' || path.startsWith('/portal/') ||
    path === '/contador' || path.startsWith('/contador/') || path.startsWith('/contador-externo')
  if (!isPublic && !path.startsWith('/dashboard') && path !== '/conta/seguranca') {
    if (!session?.user) redirect('/login')
    const storeId = (await cookies()).get(ASSISTEC_ACTIVE_STORE_COOKIE)?.value
    if (!canAccessPage(getPermissionsFromSession(session, storeId), path)) redirect('/dashboard?access=denied')
  }
  return (
    <html
      lang="pt-BR"
      data-density="operational"
      data-legibility="normal"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body
        className={`${inter.className} min-h-screen bg-background font-sans text-foreground antialiased tracking-tight`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          themes={["light", "soft-ice", "midnight", "black-edition"]}
          defaultTheme="midnight"
          enableSystem={false}
          storageKey="omni-gestao-theme"
          disableTransitionOnChange={false}
        >
          <LegibilityProvider>
            <SessionProvider session={session}>
              {children}
            </SessionProvider>
          </LegibilityProvider>
          <Toaster />
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
