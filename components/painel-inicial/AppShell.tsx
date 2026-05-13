"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { DashboardAccessAlerts } from "@/components/enterprise/DashboardAccessAlerts";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  children,
  noPadding,
}: {
  children: ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar />
        <main
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            !noPadding && "px-4 py-6 sm:px-6 lg:px-8",
          )}
        >
          <Suspense fallback={null}>
            <DashboardAccessAlerts />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
