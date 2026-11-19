import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface AuthPrincipal {
  ownerId: string;
  isGuest: boolean;
  userId?: string;
  email?: string;
  name?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: AuthPrincipal;
      requestId?: string;
    }
  }
}

const developmentSecret = randomBytes(48).toString("hex");
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function validateAuthConfig(): void {
  if (
    process.env.NODE_ENV === "production" &&
    (process.env.JWT_SECRET?.trim().length ?? 0) < 32
  ) {
    throw new Error(
      "Production requires a dedicated JWT_SECRET of at least 32 characters.",
    );
  }
}

function jwtSecret(): string {
  validateAuthConfig();
  return process.env.JWT_SECRET?.trim() || developmentSecret;
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derivePassword(password, salt)).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = await derivePassword(password, salt);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export interface JwtPayload {
  sub: string;
  email: string;
  name?: string;
  iat: number;
  exp: number;
}

export function signJwt(user: {
  id: string;
  email: string;
  name?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    } satisfies JwtPayload),
  );
  const signature = createHmac("sha256", jwtSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSig = createHmac("sha256", jwtSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf))
    return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as JwtPayload;
    if (!parsed.sub || typeof parsed.exp !== "number") return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signGuestSession(id = randomBytes(24).toString("hex")): string {
  const payload = Buffer.from(
    JSON.stringify({
      id,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", jwtSecret()).update(`guest:${payload}`).digest("base64url")}`;
}

function guestSubject(token: string): string | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", jwtSecret())
    .update(`guest:${payload}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof value.id === "string" &&
      /^[a-zA-Z0-9_-]{8,64}$/.test(value.id) &&
      value.exp > Date.now() / 1000
      ? value.id
      : null;
  } catch {
    return null;
  }
}

function cookie(req: Request, name: string): string {
  return (
    (req.header("cookie") ?? "")
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

export function resolvePrincipal(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.header("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authHeader);
  const userToken = match?.[1] || cookie(req, "nettopo_session");
  if (userToken) {
    const claims = verifyJwt(userToken);
    if (!claims) {
      res.clearCookie("nettopo_session", { path: "/" });
      if (match && !req.path.startsWith("/api/v1/auth/")) {
        res
          .status(401)
          .json({
            error: {
              code: "INVALID_TOKEN",
              message: "Your session expired. Sign in again.",
            },
          });
        return;
      }
    }
    if (claims) {
      req.principal = {
        ownerId: `user:${claims.sub}`,
        isGuest: false,
        userId: claims.sub,
        email: claims.email,
        name: claims.name,
      };
      next();
      return;
    }
  }
  let session = req.header("x-nettopo-guest") || "";
  let id = session ? guestSubject(session) : null;
  if (!id) {
    session = cookie(req, "nettopo_guest");
    id = session ? guestSubject(session) : null;
  }
  if (!id) {
    session = signGuestSession();
    id = guestSubject(session)!;
    res.cookie("nettopo_guest", session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TOKEN_TTL_SECONDS * 1000,
      path: "/",
    });
  }
  req.principal = { ownerId: `guest:${id}`, isGuest: true };
  next();
}

export function requireRegisteredUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.principal || req.principal.isGuest) {
    res
      .status(401)
      .json({
        error: {
          code: "SIGN_IN_REQUIRED",
          message: "Sign in to access this account endpoint.",
        },
      });
    return;
  }
  next();
}
