import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-60 active:translate-y-px";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-accent-from to-accent-to text-white shadow-soft hover:brightness-110 hover:shadow-card",
  secondary: "border border-border bg-elevated text-fg hover:border-border-strong",
  ghost: "text-muted hover:bg-elevated hover:text-fg",
  danger: "border border-transparent bg-danger-soft text-danger hover:brightness-105",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 w-full px-5 text-[0.95rem]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
