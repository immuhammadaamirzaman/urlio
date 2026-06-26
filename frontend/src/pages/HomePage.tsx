import { useState } from "react";
import { Link } from "react-router-dom";

import { CreateLinkForm } from "../components/CreateLinkForm";
import { ShortLinkResult } from "../components/ShortLinkResult";
import { useAuth } from "../context/AuthContext";
import type { LinkRead } from "../api/types";

export function HomePage() {
  const { isAuthenticated } = useAuth();
  const [recent, setRecent] = useState<LinkRead[]>([]);

  function handleCreated(link: LinkRead) {
    setRecent((prev) => [link, ...prev].slice(0, 5));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <section className="py-8 text-center sm:py-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Shorten links. <span className="text-brand-600">Track clicks.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
          Paste a long URL to get a short link instantly. Create an account to manage your
          links and see detailed analytics.
        </p>
      </section>

      <div className="card p-5 sm:p-6">
        <CreateLinkForm onCreated={handleCreated} />
      </div>

      {recent.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your new links
          </h2>
          {recent.map((link) => (
            <ShortLinkResult key={link.id} link={link} />
          ))}

          {!isAuthenticated && (
            <p className="pt-2 text-center text-sm text-slate-500">
              <Link to="/register" className="font-medium text-brand-600 hover:underline">
                Create a free account
              </Link>{" "}
              to keep these links and unlock analytics.
            </p>
          )}
        </section>
      )}

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Instant & anonymous",
            body: "No sign-up needed to shorten a link. Just paste and go.",
          },
          {
            title: "Custom aliases",
            body: "Pick a memorable code, set an expiry, or lock links with a password.",
          },
          {
            title: "Real analytics",
            body: "Track total clicks, unique visitors, referrers, and trends over time.",
          },
        ].map((f) => (
          <div key={f.title} className="card p-5">
            <h3 className="font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
