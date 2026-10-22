import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import CompleteLandingPreview from "@/components/landing/CompleteLandingPreview"

export default async function LandingPreviewPage() {
  if (!isPlatformSession(await auth())) redirect("/dashboard?access=denied")
  return <><p className="border-b border-border p-3 text-center text-sm">Prévia interna da landing completa. Conteúdo comercial preservado para revisão.</p><CompleteLandingPreview /></>
}
