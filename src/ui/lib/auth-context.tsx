import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

export interface AuthUser {
  userId: string;
  username: string;
  token: string;
  expiresAt: string; // ISO 8601
}

interface AuthContextValue {
  user: AuthUser | null;
  /**
   * True when a stored session existed at page load but was expired or
   * unusable. Lets ProtectedRoute tell "your session expired" apart from
   * "you were never signed in" (auth spec FR-11a).
   */
  sessionExpired: boolean;
  login: (token: string, expiresAt: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const JWT_KEY = "jwt";
const JWT_EXPIRES_AT_KEY = "jwt_expires_at";
const JWT_USERNAME_KEY = "jwt_username";
const JWT_USER_ID_KEY = "jwt_user_id";

interface StoredSession {
  user: AuthUser | null;
  sessionExpired: boolean;
}

/**
 * Reads the stored session without side effects — StrictMode double-invokes
 * state initializers, so clearing storage here would make the second call
 * misreport an expired session as "never signed in".
 */
function readStoredSession(): StoredSession {
  const token = localStorage.getItem(JWT_KEY);
  const expiresAt = localStorage.getItem(JWT_EXPIRES_AT_KEY);
  const username = localStorage.getItem(JWT_USERNAME_KEY);
  const userId = localStorage.getItem(JWT_USER_ID_KEY);

  // No token at all — the visitor was never signed in on this browser
  if (!token) return { user: null, sessionExpired: false };

  // A token exists but is incomplete or past its expiry — a session existed
  // and is no longer usable
  if (!expiresAt || !username || !userId || Date.now() >= new Date(expiresAt).getTime()) {
    return { user: null, sessionExpired: true };
  }

  return { user: { token, expiresAt, username, userId }, sessionExpired: false };
}

/**
 * Builds the `/login` redirect URL. `expired=1` is set only when a real
 * session existed and expired or became invalid — LoginPage shows the
 * "session expired" banner on that flag alone, never on `return` (auth spec FR-11a).
 */
export function loginUrl(returnPath: string, opts: { expired: boolean }): string {
  const params = new URLSearchParams({ return: returnPath });
  if (opts.expired) params.set("expired", "1");
  return `/login?${params.toString()}`;
}

/** Removes every stored session key. Also used by api-client on a 401. */
export function clearStoredSession(): void {
  localStorage.removeItem(JWT_KEY);
  localStorage.removeItem(JWT_EXPIRES_AT_KEY);
  localStorage.removeItem(JWT_USERNAME_KEY);
  localStorage.removeItem(JWT_USER_ID_KEY);
}

/** Decode a JWT payload without verifying the signature (client-side only). */
function decodeJwtPayload(token: string): { sub: string; username: string } | null {
  try {
    const [, payloadB64] = token.split(".");
    const json = atob(payloadB64!.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { sub: string; username: string };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(readStoredSession);
  const [user, setUser] = useState<AuthUser | null>(initial.user);
  const [sessionExpired, setSessionExpired] = useState(initial.sessionExpired);

  // Drop an expired/incomplete stored session once, after mount
  useEffect(() => {
    if (initial.sessionExpired) clearStoredSession();
  }, [initial]);

  const login = useCallback((token: string, expiresAt: string) => {
    const payload = decodeJwtPayload(token);
    if (!payload) return;

    localStorage.setItem(JWT_KEY, token);
    localStorage.setItem(JWT_EXPIRES_AT_KEY, expiresAt);
    localStorage.setItem(JWT_USERNAME_KEY, payload.username);
    localStorage.setItem(JWT_USER_ID_KEY, payload.sub);

    setUser({ token, expiresAt, username: payload.username, userId: payload.sub });
    setSessionExpired(false);
  }, []);

  // Expose login to window for E2E tests
  if (typeof window !== "undefined" && !window.__AUTH_LOGIN__) {
    window.__AUTH_LOGIN__ = login;
  }

  const logout = useCallback(() => {
    clearStoredSession();
    setUser(null);
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, sessionExpired, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
