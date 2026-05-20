import MarketplaceLayout from "@/components/marketplace/lovable/MarketplaceLayout";
import { ThemeProvider } from "@/components/marketplace/lovable/ThemeProvider";

export default function MarketplacePage() {
  return (
    <ThemeProvider>
      <MarketplaceLayout />
    </ThemeProvider>
  );
}
