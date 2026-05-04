"use client";

import { useMemo } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./lovable/router";
import "./vendas-hub-theme.css";

export default function VendasHubPage() {
  const router = useMemo(() => getRouter(), []);

  return (
    <div data-vendas-hub-theme-root className="vendas-hub-isolated min-h-screen antialiased">
      <RouterProvider router={router} />
    </div>
  );
}
