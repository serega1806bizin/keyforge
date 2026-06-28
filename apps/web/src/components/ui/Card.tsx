import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}

export function AuthCard({ className, children }: { className?: string; children: ReactNode }) {
  return <Card className={cn("p-7 sm:p-8", className)}>{children}</Card>;
}
