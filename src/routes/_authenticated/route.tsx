import { useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/sportura/shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingComponent: LoadingAccount,
  component: AuthenticatedLayout,
});

function LoadingAccount() {
  return (
    <AppShell>
      <p role="status">Проверяем вход…</p>
    </AppShell>
  );
}

function AuthenticatedLayout() {
  const [signedIn, setSignedIn] = useState<boolean>();
  const redirecting = useRef(false);
  const navigate = useNavigate();
  const href = useLocation({ select: (location) => location.href });

  useEffect(() => {
    let active = true;
    // Resolve browser auth after hydration. Redirecting from beforeLoad can
    // replace the server's client-only match while React is still hydrating it.
    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (active) setSignedIn(!error && !!data.user);
      })
      .catch(() => {
        if (active) setSignedIn(false);
      });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") setSignedIn(false);
      if (event === "SIGNED_IN" && session) setSignedIn(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (signedIn === false && !redirecting.current) {
      redirecting.current = true;
      void navigate({ to: "/auth", search: { redirect: href }, replace: true });
    }
  }, [signedIn, navigate, href]);

  // Every protected server function independently verifies the user's token.
  return signedIn ? <Outlet /> : <LoadingAccount />;
}
