import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  status?: "ok" | "warn" | "alert" | "idle";
  trend?: string;
  accent?: "primary" | "accent" | "warning" | "destructive";
}

const accentMap = {
  primary: "text-primary",
  accent: "text-accent",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function SensorCard({ icon: Icon, label, value, unit, status = "ok", trend, accent = "primary" }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Icon className={cn("h-4 w-4", accentMap[accent])} />
          {label}
        </div>
        <span className={cn("flex items-center gap-1.5 text-[10px] font-mono uppercase",
          status === "ok" && "text-success",
          status === "warn" && "text-warning",
          status === "alert" && "text-destructive",
          status === "idle" && "text-muted-foreground"
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full bg-current pulse-dot")} />
          {status === "ok" ? "live" : status}
        </span>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5 font-mono">
        <span className={cn("text-4xl font-semibold tracking-tight", accentMap[accent])}>{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {trend && <div className="mt-2 text-xs text-muted-foreground">{trend}</div>}
    </motion.div>
  );
}
