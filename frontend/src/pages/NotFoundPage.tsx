import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="max-w-sm text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist. Short links are handled by the
        backend, not this app.
      </p>
      <Link to="/" className="btn-primary">
        Back home
      </Link>
    </div>
  );
}
