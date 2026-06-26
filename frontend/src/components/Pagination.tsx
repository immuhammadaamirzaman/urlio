interface PaginationProps {
  offset: number;
  limit: number;
  total: number | null;
  count: number; // items on the current page
  onChange: (offset: number) => void;
}

export function Pagination({ offset, limit, total, count, onChange }: PaginationProps) {
  const start = count === 0 ? 0 : offset + 1;
  const end = offset + count;
  const hasPrev = offset > 0;
  const hasNext = total !== null ? end < total : count === limit;

  return (
    <div className="flex items-center justify-between gap-4 pt-4 text-sm text-slate-600">
      <p>
        {total !== null ? (
          <>
            Showing <span className="font-medium">{start}</span>–
            <span className="font-medium">{end}</span> of{" "}
            <span className="font-medium">{total}</span>
          </>
        ) : (
          <>
            Showing <span className="font-medium">{start}</span>–
            <span className="font-medium">{end}</span>
          </>
        )}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={!hasPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={!hasNext}
          onClick={() => onChange(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
