import { NextResponse } from "next/server"
import { CreditsUserIdError, resolveCreditsUserId } from "@/lib/credits/resolve-user-id"

export async function requireCreditsUserIdForApi(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  try {
    const userId = await resolveCreditsUserId()
    return { ok: true, userId }
  } catch (e) {
    if (e instanceof CreditsUserIdError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: e.code,
            message: e.message,
          },
          { status: 401 },
        ),
      }
    }
    throw e
  }
}
