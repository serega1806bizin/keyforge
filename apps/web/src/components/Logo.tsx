import { KeyRound } from "lucide-react";
import { cn } from "../lib/cn";

export function Logo({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent-from to-accent-to text-white shadow-soft">
        <KeyRound size={17} aria-hidden />
      </span>
      {withWordmark ? (
        <span className="text-[0.95rem] font-semibold tracking-tight text-fg">keyforge</span>
      ) : null}
    </span>
  );
}
