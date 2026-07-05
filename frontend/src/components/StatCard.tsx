export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-content">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-content-subtle">{hint}</p>}
    </div>
  );
}
