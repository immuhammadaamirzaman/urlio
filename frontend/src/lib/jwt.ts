// Minimal JWT payload reader (no verification — display purposes only, e.g. finding
// which entry in the sessions list is *this* device by its refresh token's jti).

export function jwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function jwtJti(token: string | null): string | null {
  const payload = jwtPayload(token);
  const jti = payload?.jti;
  return typeof jti === "string" ? jti : null;
}
