import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { PlataformaComercial } from "@/components/platform/SolicitacoesTeste"
export default async function PlatformPage() {
  if (!isPlatformSession(await auth())) redirect("/dashboard?access=denied")
  return <PlataformaComercial />
}
