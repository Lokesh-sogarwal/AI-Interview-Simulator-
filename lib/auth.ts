import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

const COOKIE_NAME = "aisim_token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function signAuthToken(user: AuthUser) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  return new SignJWT({
    sub: user.id,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyAuthToken(token: string) {
  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.sub !== "string") return null;

    const name = typeof payload.name === "string" ? payload.name : "";
    const email = typeof payload.email === "string" ? payload.email : "";

    return {
      id: payload.sub,
      name,
      email,
    } satisfies AuthUser;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function setAuthCookie(token: string) {
  (await cookies()).set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookie() {
  (await cookies()).set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
