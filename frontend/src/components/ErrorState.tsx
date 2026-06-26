interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <p className="text-sm font-medium text-red-800">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary text-xs">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {subtitle && <p className="max-w-sm text-sm text-slate-500">{subtitle}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
