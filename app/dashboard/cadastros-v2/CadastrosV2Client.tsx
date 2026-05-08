"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const CadastrosHubIsolated = dynamic(
  () =>
    import("@/components/cadastros/lovable/CadastrosHubIsolated").then(
      (m) => m.CadastrosHubIsolated
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full min-w-0 max-w-full p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-64" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    ),
  }
);

export default function CadastrosV2Client() {
  const debugOverflow = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("debugOverflow") === "1";
  }, []);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!debugOverflow) return;
    const root = rootRef.current;
    if (!root) return;

    // Mede e destaca elementos que estão com scrollWidth > clientWidth.
    const offenders: Array<{
      tag: string;
      id: string;
      className: string;
      clientWidth: number;
      scrollWidth: number;
      delta: number;
      el: HTMLElement;
    }> = [];

    const elements = root.querySelectorAll<HTMLElement>("*");
    elements.forEach((el) => {
      const cw = el.clientWidth;
      const sw = el.scrollWidth;
      const delta = sw - cw;
      if (cw > 0 && delta > 1) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          className: typeof el.className === "string" ? el.className : "",
          clientWidth: cw,
          scrollWidth: sw,
          delta,
          el,
        });
      }
    });

    offenders.sort((a, b) => b.delta - a.delta);
    const top = offenders.slice(0, 10);
    top.forEach((o) => {
      o.el.style.outline = "1px solid red";
      o.el.style.outlineOffset = "-1px";
    });

    // eslint-disable-next-line no-console
    console.groupCollapsed("[CadastrosV2] overflow offenders (top 10)");
    // eslint-disable-next-line no-console
    console.table(
      top.map((o) => ({
        tag: o.tag,
        id: o.id || "(none)",
        className: o.className?.slice(0, 120) || "(none)",
        clientWidth: o.clientWidth,
        scrollWidth: o.scrollWidth,
        delta: o.delta,
      }))
    );
    // eslint-disable-next-line no-console
    console.log("root clientWidth", root.clientWidth, "root scrollWidth", root.scrollWidth);
    // eslint-disable-next-line no-console
    console.groupEnd();

    return () => {
      top.forEach((o) => {
        o.el.style.outline = "";
        o.el.style.outlineOffset = "";
      });
    };
  }, [debugOverflow]);

  return (
    <div ref={rootRef} className="w-full min-w-0 max-w-full">
      <CadastrosHubIsolated />
    </div>
  );
}
