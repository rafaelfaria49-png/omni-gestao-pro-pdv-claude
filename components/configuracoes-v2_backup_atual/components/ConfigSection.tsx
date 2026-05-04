"use client";

import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

/** Agrupa blocos dentro de uma secção com ritmo vertical consistente. */
export function ConfigSection({ children, className }: Props) {
  return <div className={cn("flex flex-col gap-8", className)}>{children}</div>;
}
