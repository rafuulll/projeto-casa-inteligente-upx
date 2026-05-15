import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, Bell, BellRing, Brain, Droplets, DoorOpen, DoorClosed, Footprints, ShieldCheck, ShieldAlert, Thermometer } from "lucide-react";
import { api, getSocket, type AcaoHistorico, type Device, type Telemetria } from "@/lib/api";
import { SensorCard } from "@/components/smart/SensorCard";
import { DeviceCard } from "@/components/smart/DeviceCard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const [tele, setTele] = useState<Telemetria>({ temperatura: 0, umidade: 0, movimento: false, ia_status: "online", porta: "fechada", alarme: "desarmado" });
  const [devices, setDevices] = useState<Device[]>([]);
  const [historico, setHistorico] = useState<AcaoHistorico[]>([]);

  useEffect(() => {
    api.get<Telemetria>("/api/telemetria/atual").then((r) => setTele((t) => ({ ...t, ...r.data }))).catch(() => {});
    api.get<Device[]>("/api/devices").then((r) => setDevices(r.data ?? [])).catch(() => {});
    const s = getSocket();
    const onTele = (data: Telemetria) => setTele((t) => ({ ...t, ...data }));
    const onDev = (data: Device[]) => setDevices(data);
    const onAcao = (a: AcaoHistorico) => setHistorico((h) => [a, ...h].slice(0, 20));
    s.on("telemetria", onTele);
    s.on("devices", onDev);
    s.on("acao", onAcao);
    return () => { s.off("telemetria", onTele); s.off("devices", onDev); s.off("acao", onAcao); };
  }, []);

  const toggle = async (id: string) => {
    setDevices((ds) => ds.map((d) => d.id === id ? { ...d, estado: !d.estado } : d));
    try { await api.post(`/api/devices/${id}/toggle`); } catch {}
  };

  const portaAcao = async (acao: "abrir" | "fechar") => {
    try { await api.post(`/api/porta/${acao}`); setTele((t) => ({ ...t, porta: acao === "abrir" ? "aberta" : "fechada" })); } catch {}
  };
  const alarmeAcao = async (acao: "armar" | "desarmar") => {
    try { await api.post(`/api/alarme/${acao}`); setTele((t) => ({ ...t, alarme: acao === "armar" ? "armado" : "desarmado" })); } catch {}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SensorCard icon={Thermometer} label="Temperatura" value={tele.temperatura?.toFixed(1) ?? "—"} unit="°C" accent="warning" trend="ambiente · sala" />
          <SensorCard icon={Droplets} label="Umidade" value={tele.umidade?.toFixed(0) ?? "—"} unit="%" accent="accent" trend="DHT22 · ESP32" />
          <SensorCard icon={Footprints} label="Movimento" value={tele.movimento ? "Detectado" : "Inativo"} accent={tele.movimento ? "destructive" : "primary"} status={tele.movimento ? "alert" : "idle"} trend="PIR · entrada" />
          <SensorCard icon={Brain} label="IA Local" value={tele.ia_status === "online" ? "Online" : tele.ia_status === "aprendendo" ? "Treinando" : "Offline"} accent="primary" status={tele.ia_status === "online" ? "ok" : tele.ia_status === "aprendendo" ? "warn" : "alert"} trend="ESP32 edge model" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Porta principal</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-xl">
                {tele.porta === "aberta" ? <DoorOpen className="h-5 w-5 text-warning" /> : <DoorClosed className="h-5 w-5 text-primary" />}
                {tele.porta === "aberta" ? "Aberta" : "Fechada"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => portaAcao("abrir")} className="border-border bg-secondary/40">Abrir</Button>
              <Button onClick={() => portaAcao("fechar")} className="bg-primary text-primary-foreground hover:bg-primary/90">Fechar</Button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Alarme</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-xl">
                {tele.alarme === "armado" ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <ShieldCheck className="h-5 w-5 text-success" />}
                {tele.alarme === "armado" ? "Armado" : "Desarmado"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => alarmeAcao("desarmar")} className="border-border bg-secondary/40"><Bell className="mr-2 h-4 w-4" />Desarmar</Button>
              <Button onClick={() => alarmeAcao("armar")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"><BellRing className="mr-2 h-4 w-4" />Armar</Button>
            </div>
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
