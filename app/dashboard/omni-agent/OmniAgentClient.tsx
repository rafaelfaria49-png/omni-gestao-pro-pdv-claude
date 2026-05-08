"use client";

import dynamic from "next/dynamic";

const OmniAgentHub = dynamic(
  () => import("@/components/omni-agent/OmniAgentHub"),
  { ssr: false }
);

export default function OmniAgentClient() {
  return <OmniAgentHub />;
}
