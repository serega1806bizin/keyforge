import type { TFunction } from "i18next";

export function deviceLabel(userAgent: string | null, t: TFunction): string {
  if (!userAgent) return t("account.unknownDevice");
  const ua = userAgent;
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /chrome|crios/i.test(ua)
      ? "Chrome"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : "Browser";
  const os = /windows/i.test(ua)
    ? "Windows"
    : /android/i.test(ua)
      ? "Android"
      : /iphone|ipad|ios/i.test(ua)
        ? "iOS"
        : /mac os/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "";
  return os ? t("account.deviceOn", { browser, os }) : browser;
}
