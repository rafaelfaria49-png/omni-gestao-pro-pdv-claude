"use client"
import { Notice } from "@/components/dashboard/pessoas/ui"
export default function ErrorPage({ reset }: { reset: () => void }) { return <Notice code="FALHA_INTERNA" retry={reset} /> }
