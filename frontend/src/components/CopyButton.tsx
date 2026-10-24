import { useEffect, useRef, useState } from "react";

import { copyToClipboard } from "../lib/format";

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
}

export function CopyButton({ value, className = "", label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  // Drop the pending "Copied!" reset if the button unmounts first (e.g. the row it
  // belongs to is deleted), so the timer can't fire against a dead component.
  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy() {
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`btn-secondary text-xs ${className}`}
      aria-label={`${label} ${value}`}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
