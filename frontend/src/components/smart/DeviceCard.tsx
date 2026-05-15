import { Switch } from "@/components/ui/switch";
import type { Device } from "@/lib/api";
import { Lightbulb, Fan, Tv, Plug, AirVent, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const iconForTipo = (tipo: string): LucideIcon => {
  const t = tipo.toLowerCase();
  if (t.includes("luz") || t.includes("light")) return Lightbulb;
  if (t.includes("vent") || t.includes("fan")) return Fan;
  if (t.includes("tv")) return Tv;
  if (t.includes("ar") || t.includes("ac")) return AirVent;
  return Plug;
};

export function DeviceCard({ device, onToggle }: { device: Device; onToggle: (id: string) => void }) {
  const Icon = iconForTipo(device.tipo);
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3 transition-all",
      device.estado && "border-primary/40 bg-primary/5"
    )}>
      <div className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background/60",
        device.estado && "border-primary/50 text-primary glow-primary"
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{device.nome}</div>
        <div className="text-xs text-muted-foreground">{device.tipo}</div>
      </div>
      <Switch checked={device.estado} onCheckedChange={() => onToggle(device.id)} />
    </div>
  );
}
