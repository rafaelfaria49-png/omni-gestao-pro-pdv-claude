"use client";

import { useLojaAtiva } from "@/lib/loja-ativa";
import { useMarketplaceConnections } from "@/components/marketplace/use-marketplace-connections";
import { MarketplaceConnectionsReal } from "@/components/marketplace/MarketplaceConnectionsReal";

export function ConexoesTab() {
  const { lojaAtivaId } = useLojaAtiva();
  const hub = useMarketplaceConnections(lojaAtivaId);
  return (
    <div className="space-y-6">
      <MarketplaceConnectionsReal storeId={lojaAtivaId} hub={hub} />
    </div>
  );
}
