import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { TopNav } from "@/components/smart/TopNav";
import { ChatPanel } from "@/components/smart/ChatPanel";
import { API_BASE } from "@/lib/api";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-7xl font-bold text-primary text-glow">404</h1>
        <p className="mt-4 text-muted-foreground">Página não encontrada.</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Voltar</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Falha ao carregar</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Tentar novamente</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SmartHaus — IoT Control" },
      { name: "description", content: "Painel de controle inteligente para sua casa." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  if (typeof window !== "undefined" && !(window as any).__sseStarted) {
    (window as any).__sseStarted = true;
    const es = new EventSource(`${API_BASE}/api/events`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        queryClient.setQueryData(["telemetria"], data);
      } catch {}
    };
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <TopNav />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </main>
        <ChatPanel />
      </div>
    </QueryClientProvider>
  );
}
