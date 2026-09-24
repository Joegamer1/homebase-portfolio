import { Header } from "./header";
import { Navigation } from "./navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[196px_1fr]">
      <Navigation />
      <div className="min-w-0">
        <Header />
        <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
