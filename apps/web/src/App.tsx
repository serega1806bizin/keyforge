import { useEffect, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "./components/AuthLayout";
import { AccountPage } from "./pages/AccountPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SignupPage } from "./pages/SignupPage";

function resolve(path: string): { page: ReactElement; titleKey: string } {
  const login = path.match(/^\/login\/([^/]+)\/?$/);
  if (login) {
    return {
      page: <LoginPage interactionId={decodeURIComponent(login[1]!)} />,
      titleKey: "titles.login",
    };
  }
  if (path === "/signup" || path === "/signup/") {
    return { page: <SignupPage />, titleKey: "titles.signup" };
  }
  if (path === "/settings" || path === "/settings/") {
    return { page: <AccountPage />, titleKey: "titles.account" };
  }
  return { page: <NotFoundPage />, titleKey: "titles.notFound" };
}

export function App() {
  const { t, i18n } = useTranslation();
  const { page, titleKey } = resolve(window.location.pathname);

  useEffect(() => {
    document.title = t(titleKey);
  }, [t, titleKey, i18n.language]);

  return <AuthLayout>{page}</AuthLayout>;
}
