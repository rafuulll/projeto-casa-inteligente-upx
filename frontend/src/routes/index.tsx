import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// useQueryClient é usado para devices e socket updates
import { Activity, Bell, BellRing, Droplets, DoorOpen, DoorClosed, Footprints, ShieldCheck, ShieldAlert, Thermometer } from "lucide-react";
import { API_BASE, api, getSocket, type AcaoHistorico, type Device, type Telemetria } from "@/lib/api";
import { SensorCard } from "@/components/smart/SensorCard";
import { DeviceCard } from "@/components/smart/DeviceCard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const queryClient = useQueryClient();
  const [tele, setTele] = useState<Telemetria>({ temperatura: 0, umidade: 0, movimento: false, ia_status: "aprendendo", porta: "fechada", alarme: "desarmado" });
  const [historico, setHistorico] = useState<AcaoHistorico[]>([]);

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => api.get<Device[]>("/api/devices").then((r) => r.data ?? []),
    staleTime: 0,
  });

  // Carrega dados iniciais
  useEffect(() => {
    api.get<Telemetria>("/api/telemetria/atual").then((r) => setTele(r.data)).catch(() => {});
    api.get("/api/logs").then((r) => {
      setHistorico((r.data ?? []).map((l: any) => ({
        id: String(l.id),
        timestamp: l.createdAt,
        descricao: `${l.device?.name ?? l.deviceId} ${l.action === "ON" ? "ligado" : "desligado"}`,
        tipo: l.action === "ON" ? "on" : "off",
      })));
    }).catch(() => {});
  }, []);

  // SSE com reconexão automática
  useEffect(() => {
    let es: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource(`${API_BASE}/api/events`);
      es.onmessage = (e) => { try { setTele(JSON.parse(e.data)); } catch {} };
      es.onerror = () => {
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => { es?.close(); clearTimeout(reconnectTimer); };
  }, []);

  // Socket.IO para logs em tempo real
  useEffect(() => {
    const s = getSocket();
    const onLog = (l: any) => {
      const acao: AcaoHistorico = {
        id: String(l.id),
        timestamp: l.createdAt,
        descricao: l.descricao ?? `${l.device?.name ?? l.deviceId} ${l.action === "ON" ? "ligado" : "desligado"}`,
        tipo: l.action === "ON" ? "on" : "off",
      };
      setHistorico((h) => [acao, ...h].slice(0, 20));
    };
    const onDevUpdate = (updated: Device) => {
      queryClient.setQueryData(["devices"], (old: Device[] = []) =>
        old.map((d) => (d.id === updated.id ? updated : d))
      );
    };
    s.on("new_log", onLog);
    s.on("device_update", onDevUpdate);
    return () => { s.off("new_log", onLog); s.off("device_update", onDevUpdate); };
  }, [queryClient]);

  const toggle = async (id: string) => {
    queryClient.setQueryData(["devices"], (old: Device[] = []) =>
      old.map((d) => (d.id === id ? { ...d, estado: !d.estado } : d))
    );
    try { await api.post(`/api/devices/${id}/toggle`); } catch {}
  };

  const portaAcao = async (acao: "abrir" | "fechar") => {
    setTele((t) => ({ ...t, porta: acao === "abrir" ? "aberta" : "fechada" }));
    try { await api.post(`/api/porta/${acao}`); } catch {}
  };

  const alarmeAcao = async (acao: "armar" | "desarmar") => {
    setTele((t) => ({ ...t, alarme: acao === "armar" ? "armado" : "desarmado" }));
    try { await api.post(`/api/alarme/${acao}`); } catch {}
  };

  const porComodo = useMemo(() => {
    return devices.reduce<Record<string, Device[]>>((acc, d) => {
      const k = d.comodo || "Outros";
      (acc[k] ||= []).push(d);
      return acc;
    }, {});
  }, [devices]);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="font-mono text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Monitoramento em tempo real dos sensores e dispositivos.</p>
          </div>
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <SensorCard icon={Thermometer} label="Temperatura" value={tele?.temperatura?.toFixed(1) ?? "—"} unit="°C" accent="warning" trend="ambiente · sala" />
          <SensorCard icon={Droplets} label="Umidade" value={tele?.umidade?.toFixed(0) ?? "—"} unit="%" accent="accent" trend="DHT22 · ESP32" />
          <SensorCard
            icon={Footprints}
            label="Movimento"
            value={tele?.movimento ? (tele.alarme === "armado" ? "Alarme!" : "Detectado") : "Inativo"}
            accent={tele?.movimento && tele.alarme === "armado" ? "warning" : tele?.movimento ? "destructive" : "primary"}
            status={tele?.movimento ? "alert" : "idle"}
            trend="PIR · entrada"
          />
        </div>
      </section>

      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Porta principal</div>
            <div className="mt-2 flex items-center gap-2 font-mono text-2xl font-semibold">
              {tele.porta === "aberta" ? <DoorOpen className="h-6 w-6 text-warning" /> : <DoorClosed className="h-6 w-6 text-primary" />}
              <span className={tele.porta === "aberta" ? "text-warning" : "text-primary"}>
                {tele.porta === "aberta" ? "Aberta" : "Fechada"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => portaAcao("abrir")} className="border-border bg-secondary/40">Abrir</Button>
            <Button onClick={() => portaAcao("fechar")} className="bg-primary text-primary-foreground hover:bg-primary/90">Fechar</Button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Alarme</div>
            <div className="mt-2 flex items-center gap-2 font-mono text-2xl font-semibold">
              {tele.alarme === "armado" ? <ShieldCheck className="h-6 w-6 text-success" /> : <ShieldAlert className="h-6 w-6 text-destructive" />}
              <span className={tele.alarme === "armado" ? "text-success" : "text-destructive"}>
                {tele.alarme === "armado" ? "Armado" : "Desarmado"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => alarmeAcao("desarmar")} className="border-border bg-secondary/40"><Bell className="mr-2 h-4 w-4" />Desarmar</Button>
            <Button onClick={() => alarmeAcao("armar")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"><BellRing className="mr-2 h-4 w-4" />Armar</Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-mono text-lg font-semibold">Cômodos</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {Object.entries(porComodo).length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
              Nenhum dispositivo conectado. Verifique o backend em <span className="font-mono">localhost:3001</span>.
            </div>
          )}
          {Object.entries(porComodo).map(([comodo, items]) => (
            <div key={comodo} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-mono text-sm font-semibold uppercase tracking-wider">{comodo}</h3>
                <span className="text-xs text-muted-foreground">{items.filter((d) => d.estado).length}/{items.length} ativos</span>
              </div>
              <div className="space-y-2">
                {items.map((d) => <DeviceCard key={d.id} device={d} onToggle={toggle} />)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm font-semibold uppercase tracking-wider">Histórico de ações</h2>
        </div>
        <div className="divide-y divide-border">
          {historico.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">Aguardando eventos…</div>}
          {historico.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" />
                <span>{a.descricao}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
