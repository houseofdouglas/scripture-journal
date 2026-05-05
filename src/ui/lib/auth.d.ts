declare global {
  interface Window {
    __AUTH_LOGIN__?: (token: string, expiresAt: string) => void;
  }
}

export {};
