import { useQuery } from "@tanstack/react-query";
import { getSessionUser } from "./auth.functions";

export const SESSION_QUERY_KEY = ["session-user"] as const;

/**
 * The signed-in user from the session cookie, or null. Undefined while loading.
 * Sign-in and password reset reload the page; sign-out clears the query cache.
 */
export function useSessionUser() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => getSessionUser(),
    staleTime: 60_000,
    retry: false,
  });
}
