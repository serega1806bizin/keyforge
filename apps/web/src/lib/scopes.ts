import { CircleUser, KeyRound, type LucideIcon, Mail, RefreshCw, ShieldCheck } from "lucide-react";

export const KNOWN_SCOPES = ["openid", "profile", "email", "offline_access"];

const ICONS: Record<string, LucideIcon> = {
  openid: ShieldCheck,
  profile: CircleUser,
  email: Mail,
  offline_access: RefreshCw,
};

export function scopeIcon(scope: string): LucideIcon {
  return ICONS[scope] ?? KeyRound;
}
