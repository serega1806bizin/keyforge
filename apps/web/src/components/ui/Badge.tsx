import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "neutral" | "primary" | "success";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-elevated text-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
