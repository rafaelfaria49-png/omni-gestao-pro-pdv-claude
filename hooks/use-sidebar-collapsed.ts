"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "omnigestao:sidebar-collapsed";
const EVENT_NAME = "omnigestao:sidebar-collapsed-change";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useSidebarCollapsed(): {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
} {
  const [collapsed, setCollapsedState] = useState<boolean>(false);

  useEffect(() => {
    setCollapsedState(readInitial());
    const onChange = (e: Event) => {
      const v = (e as CustomEvent<boolean>).detail;
      setCollapsedState(Boolean(v));
    };
    window.addEventListener(EVENT_NAME, onChange as EventListener);
    return () => window.removeEventListener(EVENT_NAME, onChange as EventListener);
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    setCollapsedState(v);
    window.dispatchEvent(new CustomEvent<boolean>(EVENT_NAME, { detail: v }));
  }, []);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return { collapsed, setCollapsed, toggle };
}
