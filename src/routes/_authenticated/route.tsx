import { useI18n } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useSessionUser } from "@/lib/use-session";
import { AppShell } from "@/components/sportura/shell";
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingComponent: LoadingAccount,
  component: AuthenticatedLayout,
});
function LoadingAccount() {
  const { tr } = useI18n();
  return (
    <AppShell>
      <p role="status">{tr("Проверяем вход…")}</p>
    </AppShell>
  );
}
function AuthenticatedLayout() {
  const session = useSessionUser();
  const redirecting = useRef(false);
  const navigate = useNavigate();
  const href = useLocation({ select: (location) => location.href });
  // Resolve auth after hydration. Redirecting from beforeLoad can replace the
  // server's client-only match while React is still hydrating it.
  const signedIn = session.isPending
    ? undefined
    : !session.isError && !!session.data;
  useEffect(() => {
    if (signedIn === false && !redirecting.current) {
      redirecting.current = true;
      void navigate({ to: "/auth", search: { redirect: href }, replace: true });
    }
  }, [signedIn, navigate, href]);
  // Every protected server function independently verifies the user's token.
  return signedIn ? <Outlet /> : <LoadingAccount />;
}
