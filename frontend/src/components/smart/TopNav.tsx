import { Link } from "@tanstack/react-router";
import { Activity, Cpu, LayoutDashboard, LineChart } from "lucide-react";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/historico", label: "Histórico", icon: LineChart },
  { to: "/automacoes", label: "Automações", icon: Cpu },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground glow-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">SmartHaus</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">IoT Control</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="group relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-muted-foreground md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
          ESP32 ONLINE
        </div>
      </div>
    </header>
  );
}
