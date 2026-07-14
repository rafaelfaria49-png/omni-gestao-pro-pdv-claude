"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Rota legada de admin — canonicalizada para a entrada operacional (`/login`). */
export default function LoginAdminPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/login")
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm p-6 text-center">
      Redirecionando para a entrada segura…
    </div>
  )
}
