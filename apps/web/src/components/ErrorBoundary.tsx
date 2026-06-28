import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";
import { Button } from "./ui/Button";

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[keyforge] render error", error, info);
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-card">
          <h1 className="text-lg font-semibold text-fg">{i18n.t("boundary.title")}</h1>
          <p className="mt-2 text-sm text-muted">{i18n.t("boundary.subtitle")}</p>
          <div className="mt-5">
            <Button onClick={() => window.location.reload()}>{i18n.t("boundary.reload")}</Button>
          </div>
        </div>
      </div>
    );
  }
}
