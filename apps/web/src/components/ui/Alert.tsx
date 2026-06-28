import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type AlertTone = "info" | "success" | "error";

const tones: Record<AlertTone, { className: string; icon: ReactNode; role: "status" | "alert" }> = {
  info: {
    className: "border-border bg-elevated text-muted",
    icon: <Info size={16} />,
    role: "status",
  },
  success: {
    className: "border-transparent bg-success-soft text-success",
    icon: <CircleCheck size={16} />,
    role: "status",
  },
  error: {
    className: "border-transparent bg-danger-soft text-danger",
    icon: <TriangleAlert size={16} />,
    role: "alert",
  },
};

export function Alert({ tone = "info", children }: { tone?: AlertTone; children: ReactNode }) {
  const t = tones[tone];
  return (
    <div
      role={t.role}
      className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", t.className)}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {t.icon}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
