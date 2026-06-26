export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 15l6-6M10.5 6.5l1-1a4 4 0 015.657 5.657l-1 1M13.5 17.5l-1 1a4 4 0 01-5.657-5.657l1-1"
          />
        </svg>
      </span>
      <span>
        Shortly<span className="text-brand-600">X</span>
      </span>
    </span>
  );
}
