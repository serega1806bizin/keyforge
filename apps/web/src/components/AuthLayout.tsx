import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./ui/LanguageSwitcher";
import { ThemeToggle } from "./ui/ThemeToggle";

function Background() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-32 -top-32 size-[26rem] rounded-full bg-accent-from/20 blur-[130px]" />
      <div className="absolute -bottom-40 -right-24 size-[26rem] rounded-full bg-accent-to/20 blur-[130px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,var(--color-canvas-accent),transparent_55%)]" />
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <a
          href="/signup"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <Logo />
        </a>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6">
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </main>
      <footer className="relative z-10 px-5 py-5 text-center text-xs text-muted">
        {t("common.footer")}
      </footer>
    </div>
  );
}
