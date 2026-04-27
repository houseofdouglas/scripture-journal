import {
  createContext,
  useContext,
  useState,
  useCallback,
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
  login: (token: string, expiresAt: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const JWT_KEY = "jwt";
const JWT_EXPIRES_AT_KEY = "jwt_expires_at";
const JWT_USERNAME_KEY = "jwt_username";
const JWT_USER_ID_KEY = "jwt_user_id";

function loadStoredUser(): AuthUser | null {
  const token = localStorage.getItem(JWT_KEY);
  const expiresAt = localStorage.getItem(JWT_EXPIRES_AT_KEY);
  const username = localStorage.getItem(JWT_USERNAME_KEY);
  const userId = localStorage.getItem(JWT_USER_ID_KEY);

  if (!token || !expiresAt || !username || !userId) return null;

  // Expired token — clear and return null
  if (Date.now() >= new Date(expiresAt).getTime()) {
    clearStorage();
    return null;
  }

  return { token, expiresAt, username, userId };
}

function clearStorage(): void {
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
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);

  const login = useCallback((token: string, expiresAt: string) => {
    const payload = decodeJwtPayload(token);
    if (!payload) return;

    localStorage.setItem(JWT_KEY, token);
    localStorage.setItem(JWT_EXPIRES_AT_KEY, expiresAt);
    localStorage.setItem(JWT_USERNAME_KEY, payload.username);
    localStorage.setItem(JWT_USER_ID_KEY, payload.sub);

    setUser({ token, expiresAt, username: payload.username, userId: payload.sub });
  }, []);

  // Expose login to window for E2E tests
  if (typeof window !== "undefined" && !window.__AUTH_LOGIN__) {
    window.__AUTH_LOGIN__ = login;
  }

  const logout = useCallback(() => {
    clearStorage();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
