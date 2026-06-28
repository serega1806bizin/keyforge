import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-elevated " +
          "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
          "focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
