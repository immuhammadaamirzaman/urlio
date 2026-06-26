import { Outlet } from "react-router-dom";

import { Navbar } from "./Navbar";

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-400">
          ShortlyX — a fast, self-hosted URL shortener.
        </div>
      </footer>
    </div>
  );
}
