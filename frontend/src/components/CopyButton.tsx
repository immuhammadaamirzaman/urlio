import { useState } from "react";

import { copyToClipboard } from "../lib/format";

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
}

export function CopyButton({ value, className = "", label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
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
