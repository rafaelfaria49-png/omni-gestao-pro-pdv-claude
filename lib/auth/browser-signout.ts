"use client"

import { signOut } from "next-auth/react"
import {
  broadcastAuthLogout,
  markCachePurgeRetryNeeded,
  purgeAuthenticatedBrowserCaches,
} from "./pwa-cache-privacy"

export async function signOutBrowserSession(redirectTo: string): Promise<string> {
  const target = new URL(redirectTo, window.location.origin)
  // Keep Auth.js responsible for CSRF and for clearing the browser session.
  const result = await signOut({ redirect: false, redirectTo })
  if (!result?.url || new URL(result.url, window.location.origin).href !== target.href) {
    throw new Error("AUTH_SIGNOUT_NOT_CONFIRMED")
  }

  const purge = await purgeAuthenticatedBrowserCaches()
  markCachePurgeRetryNeeded(!purge.ok)
  broadcastAuthLogout()
  return target.href
}
