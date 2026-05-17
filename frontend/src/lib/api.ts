import axios from "axios";
import { io, type Socket } from "socket.io-client";
import type { QueryClient } from "@tanstack/react-query";

export const API_BASE = "http://localhost:3001";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
});

let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, { transports: ["websocket", "polling"], autoConnect: true });
  }
  return socket;
}

// Poller global — roda fora do ciclo do React, não é afetado pelo Strict Mode
let _pollerStarted = false;

export function startGlobalPoller(queryClient: QueryClient) {
  if (_pollerStarted) return;
  _pollerStarted = true;

  const fetchAndUpdate = async () => {
    try {
      const { data } = await api.get<Telemetria>("/api/telemetria/atual");
      queryClient.setQueryData(["telemetria"], data);
    } catch {}
    try {
      const { data } = await api.get<Device[]>("/api/devices");
      if (data?.length) queryClient.setQueryData(["devices"], data);
    } catch {}
  };

  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);

  // Socket.IO como complemento para atualizações imediatas
  const s = getSocket();
  (window as any).__smarthouse_socket = s;
  s.on("telemetria", (data: Telemetria) => {
    queryClient.setQueryData(["telemetria"], (old: Telemetria) => ({ ...old, ...data }));
  });
  s.on("device_update", (updated: Device) => {
    queryClient.setQueryData(["devices"], (old: Device[] = []) =>
      old.map((d) => (d.id === updated.id ? updated : d))
    );
  });
}

export interface Device {
  id: string;
  nome: string;
  comodo: string;
  tipo: string;
  estado: boolean;
}

export interface Telemetria {
  temperatura: number;
  umidade: number;
  movimento: boolean;
  ia_status?: "online" | "offline" | "aprendendo";
  porta?: "aberta" | "fechada";
  alarme?: "armado" | "desarmado";
  timestamp?: string;
}

export interface HistoricoPonto {
  timestamp: string;
  temperatura: number;
  umidade: number;
}

export interface MovimentoEvento {
  id: string;
  timestamp: string;
  local: string;
}

export interface AcaoHistorico {
  id: string;
  timestamp: string;
  descricao: string;
  tipo: string;
}

export interface Regra {
  id: string;
  nome: string;
  descricao: string;
  ativa: boolean;
  trigger?: string;
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}
