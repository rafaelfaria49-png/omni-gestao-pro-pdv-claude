import { handlers } from "@/auth"
import { createAuthRouteHandlers } from "@/lib/auth/signout-race-guard"

export const runtime = "nodejs"

export const { GET, POST } = createAuthRouteHandlers(handlers)
