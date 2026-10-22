import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { PilotProvisioning } from "@/components/platform/PilotProvisioning"
export default async function PlatformPage() {
  if (!isPlatformSession(await auth())) redirect("/dashboard?access=denied")
  return <PilotProvisioning />
}
