import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "../../lib/theme";

export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-border bg-surface text-fg shadow-card",
        },
      }}
    />
  );
}
