"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  TEMPLATES,
  type StudioMood,
  type StudioTemplate,
} from "./studio/studio-templates";

export type StudioPreviewState = {
  template: StudioTemplate;
  activeTake: number;
  takeMedia: (string | null)[];
  caption: string;
  mood: StudioMood;
  showLogo: boolean;
  showPrice: boolean;
};

function defaultPreview(): StudioPreviewState {
  return {
    template: "bomDia",
    activeTake: 0,
    takeMedia: [null, null, null],
    caption: TEMPLATES.bomDia.caption,
    mood: "animado",
    showLogo: true,
    showPrice: false,
  };
}

type StudioPreviewContextValue = {
  preview: StudioPreviewState;
  setPreview: Dispatch<SetStateAction<StudioPreviewState>>;
  resetForTemplate: (template: StudioTemplate) => void;
};

const StudioPreviewContext = createContext<StudioPreviewContextValue | null>(null);

export function StudioPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<StudioPreviewState>(defaultPreview);

  const resetForTemplate = useCallback((template: StudioTemplate) => {
    const tpl = TEMPLATES[template];
    setPreview({
      template,
      activeTake: 0,
      takeMedia: [null, null, null],
      caption: tpl.caption,
      mood: "animado",
      showLogo: true,
      showPrice: false,
    });
  }, []);

  const value = useMemo(
    () => ({ preview, setPreview, resetForTemplate }),
    [preview, resetForTemplate],
  );

  return (
    <StudioPreviewContext.Provider value={value}>{children}</StudioPreviewContext.Provider>
  );
}

export function useStudioPreview() {
  const ctx = useContext(StudioPreviewContext);
  if (!ctx) {
    throw new Error("useStudioPreview must be used within StudioPreviewProvider");
  }
  return ctx;
}

/** Sidebar preview outside the provider: keep static defaults. */
export function useStudioPreviewOptional() {
  return useContext(StudioPreviewContext);
}
