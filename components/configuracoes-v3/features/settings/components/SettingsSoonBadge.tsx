import { Clock } from "lucide-react";
import { SettingsStatusBadge } from "./SettingsStatusBadge";

export function SettingsSoonBadge({ className }: { className?: string }) {
  return (
    <SettingsStatusBadge
      tone="soon"
      icon={<Clock className="h-3 w-3" />}
      className={className}
    >
      Em breve
    </SettingsStatusBadge>
  );
}
