"use client";

import { cn } from "@/lib/utils";
import type { OSStatus } from "@/types/os";
import { statusFlow, TONE_BADGE_CLASS } from "../data/status-flow";

export function StatusBadgeV3({
  status,
  className,
}: {
  status: OSStatus | string | null | undefined;
  className?: string;
}) {
  const flow = statusFlow(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_BADGE_CLASS[flow.tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {flow.label}
    </span>
  );
}
