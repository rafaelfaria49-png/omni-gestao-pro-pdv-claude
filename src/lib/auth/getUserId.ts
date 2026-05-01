import { cookies } from "next/headers"

export async function getUserId() {
  const cookieStore = await cookies()
  const session = cookieStore.get("assistec_admin_session")

  if (session?.value) {
    return session.value
  }

  // TODO: remover quando auth real estiver implementada
  return "mock-admin"
}

