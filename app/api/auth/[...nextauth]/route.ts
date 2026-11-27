import type { NextRequest } from "next/server"
import { handlers } from "@/auth"
import { guardSessionEndpoint } from "@/lib/auth/session-cookie-response"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return guardSessionEndpoint(request, await handlers.GET(request))
}

export async function POST(request: NextRequest) {
  return guardSessionEndpoint(request, await handlers.POST(request))
}
