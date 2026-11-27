const sessionCookieName = /^(?:(?:__Secure|__Host)-)?authjs\.session-token(?:\.\d+)?$/

/**
 * A session read can finish after logout or the next login. It must never
 * replace or expire the browser's session cookie, even on another instance.
 */
export function withoutSessionCookieMutation(response: Response, noStore = false): Response {
  const cookies = response.headers.getSetCookie()
  const passthrough = cookies.filter((cookie) => !sessionCookieName.test(cookie.split("=", 1)[0]?.trim() ?? ""))
  if (!noStore && passthrough.length === cookies.length) return response

  const headers = new Headers(response.headers)
  headers.delete("set-cookie")
  for (const cookie of passthrough) headers.append("set-cookie", cookie)
  if (noStore) headers.set("cache-control", "private, no-store")
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function guardSessionEndpoint(request: Request, response: Response): Response {
  const pathname = new URL(request.url).pathname
  return pathname === "/api/auth/session" || pathname === "/api/auth/session/"
    ? withoutSessionCookieMutation(response, true)
    : response
}
