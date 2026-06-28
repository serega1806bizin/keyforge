import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, invalid, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      {icon ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
          {icon}
        </span>
      ) : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-11 w-full rounded-lg border bg-elevated px-3 text-sm text-fg outline-none transition " +
            "placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
            "focus-visible:ring-offset-surface",
          icon ? "pl-9" : "",
          invalid ? "border-danger" : "border-border hover:border-border-strong",
          className,
        )}
        {...props}
      />
    </div>
  );
});
