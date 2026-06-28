import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { IconButton } from "./IconButton";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const dark = theme === "dark";
  return (
    <IconButton label={dark ? t("theme.toLight") : t("theme.toDark")} onClick={toggle}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
