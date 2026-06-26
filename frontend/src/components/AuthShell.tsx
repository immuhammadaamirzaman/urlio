import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Logo } from "./Logo";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="mx-auto max-w-md py-8">
      <div className="mb-6 flex justify-center">
        <Link to="/" className="text-xl text-slate-900">
          <Logo />
        </Link>
      </div>
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">{footer}</p>
    </div>
  );
}
