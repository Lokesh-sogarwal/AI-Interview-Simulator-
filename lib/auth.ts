import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ObjectId, type Db } from "mongodb";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
};

const COOKIE_NAME = "aisim_token";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

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
    isAdmin: user.isAdmin || false,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAuthToken(token: string) {
  const secret = getJwtSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.sub !== "string") return null;

    const name = typeof payload.name === "string" ? payload.name : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const isAdmin = Boolean(payload.isAdmin || false);

    return {
      id: payload.sub,
      name,
      email,
      isAdmin,
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

/**
 * Admin rights are re-checked against the database on every admin request so a
 * revoked admin cannot keep using a still-valid token.
 */
export async function isAdminInDb(db: Db, userId: string) {
  if (!ObjectId.isValid(userId)) return false;
  const doc = await db
    .collection("users")
    .findOne({ _id: new ObjectId(userId) }, { projection: { isAdmin: 1, role: 1 } });
  // Same rule as lib/roles.ts roleFromDoc (kept inline to avoid an import cycle).
  const role = ["user", "admin", "superadmin"].includes(doc?.role) ? doc!.role : doc?.isAdmin === true ? "admin" : "user";
  return role === "admin" || role === "superadmin";
}

export async function setAuthCookie(token: string) {
  (await cookies()).set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
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
