import { Fingerprint } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { Button } from "./ui/Button";

export interface PasskeyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  label: string;
  loadingLabel: string;
}

export function PasskeyButton({
  loading = false,
  label,
  loadingLabel,
  ...props
}: PasskeyButtonProps) {
  return (
    <Button size="lg" loading={loading} {...props}>
      {loading ? null : <Fingerprint size={18} aria-hidden />}
      {loading ? loadingLabel : label}
    </Button>
  );
}
