"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";

const CadastrosHubIsolated = dynamic(
  () =>
    import("@/components/cadastros/lovable/CadastrosHubIsolated").then(
      (m) => m.CadastrosHubIsolated
    ),
  { ssr: false }
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
