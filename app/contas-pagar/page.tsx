import { redirect } from "next/navigation"
import { ROOT_SEGMENT_REDIRECTS } from "@/lib/navigation/legacy-routes"

export default function Page() {
  redirect(ROOT_SEGMENT_REDIRECTS["contas-pagar"])
}
