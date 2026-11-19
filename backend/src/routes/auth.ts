import { randomBytes } from "node:crypto";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { Router } from "express";
import { z } from "zod";
import {
  hashPassword,
  requireRegisteredUser,
  signGuestSession,
  signJwt,
  verifyPassword,
} from "../middleware/auth";
import { HttpError } from "../middleware/error-handler";
import type { DataStore } from "../storage/types";

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function getGoogleOAuthConfig(reqHost?: string, protocol?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const appUrl = (process.env.APP_URL?.trim() || `${protocol || "http"}://${reqHost || "localhost:3000"}`).replace(/\/$/, "");
  const callbackUrl =
    process.env.GOOGLE_CALLBACK_URL?.trim() ||
    `${appUrl}/api/v1/auth/google/callback`;
  return {
    enabled: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    appUrl,
    callbackUrl,
  };
}

const registerSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(1).max(128),
});

export function authRouter(store: DataStore) {
  const router = Router();

  router.get("/guest", (req, res) => {
    const token = signGuestSession(
      req.principal?.isGuest ? req.principal.ownerId.slice(6) : undefined,
    );
    res.cookie("nettopo_guest", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 604800000,
      path: "/",
    });
    res.json({ token });
  });
  router.post("/logout", (_req, res) => {
    res.clearCookie("nettopo_session", { path: "/" });
    res.json({ ok: true });
  });

  router.post("/register", async (req, res, next) => {
    try {
      const body = registerSchema.parse(req.body);
      const existing = await store.findUserByEmail(body.email);
      if (existing) {
        throw new HttpError(
          409,
          "EMAIL_EXISTS",
          "An account with this email already exists.",
        );
      }
      const user = await store.createUser({
        email: body.email,
        name: body.name,
        passwordHash: await hashPassword(body.password),
      });
      // Adopt any designs created during the current guest session
      if (req.principal?.isGuest) {
        await store.adoptGuestRecords(req.principal.ownerId, `user:${user.id}`);
      }
      const token = signJwt({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      res.cookie("nettopo_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 604800000,
        path: "/",
      });
      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const user = await store.findUserByEmail(body.email);
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new HttpError(
          401,
          "INVALID_CREDENTIALS",
          "Invalid email or password.",
        );
      }
      if (req.principal?.isGuest) {
        await store.adoptGuestRecords(req.principal.ownerId, `user:${user.id}`);
      }
      const token = signJwt({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      res.cookie("nettopo_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 604800000,
        path: "/",
      });
      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/providers", (req, res) => {
    const google = getGoogleOAuthConfig(req.get("host"), req.protocol);
    const clerk = Boolean(process.env.CLERK_SECRET_KEY?.trim());
    res.json({
      google: google.enabled || clerk,
      clerk,
    });
  });

  router.post("/clerk-sync", async (req, res, next) => {
    try {
      const secretKey = process.env.CLERK_SECRET_KEY?.trim();
      if (!secretKey) {
        throw new HttpError(
          503,
          "CLERK_NOT_CONFIGURED",
          "Clerk authentication is not configured on this server.",
        );
      }
      const { token: clerkToken } = z
        .object({ token: z.string().min(10) })
        .parse(req.body);

      const verified = await verifyToken(clerkToken, { secretKey });
      const clerkUserId = verified.sub;
      if (!clerkUserId) {
        throw new HttpError(401, "INVALID_TOKEN", "Invalid Clerk session token.");
      }

      const clerkClient = createClerkClient({ secretKey });
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const primaryEmail =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

      if (!primaryEmail) {
        throw new HttpError(
          400,
          "EMAIL_REQUIRED",
          "Your Google/Clerk account must have a verified email address.",
        );
      }

      const email = primaryEmail.trim().toLowerCase();
      const fullName =
        [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        clerkUser.username ||
        email.split("@")[0] ||
        "Engineer";

      let user = await store.findUserByEmail(email);
      if (!user) {
        user = await store.createUser({
          email,
          name: fullName.slice(0, 80),
          passwordHash: await hashPassword(randomBytes(32).toString("hex")),
        });
      }

      if (req.principal?.isGuest) {
        await store.adoptGuestRecords(req.principal.ownerId, `user:${user.id}`);
      }

      const sessionToken = signJwt({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      res.cookie("nettopo_session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 604800000,
        path: "/",
      });
      res.json({
        token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/google", (req, res) => {
    const cfg = getGoogleOAuthConfig(req.get("host"), req.protocol);
    if (!cfg.enabled) {
      res.redirect(`${cfg.appUrl}/auth?error=google_not_configured`);
      return;
    }
    const state = randomBytes(24).toString("hex");
    res.cookie("nettopo_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
      path: "/",
    });
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  router.get("/google/callback", async (req, res) => {
    const cfg = getGoogleOAuthConfig(req.get("host"), req.protocol);
    if (!cfg.enabled) {
      res.redirect(`${cfg.appUrl}/auth?error=google_not_configured`);
      return;
    }
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const cookies = parseCookieHeader(req.header("cookie"));
      res.clearCookie("nettopo_oauth_state", { path: "/" });

      if (!code || !state || cookies.nettopo_oauth_state !== state) {
        res.redirect(`${cfg.appUrl}/auth?error=google_state_invalid`);
        return;
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.callbackUrl,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        res.redirect(`${cfg.appUrl}/auth?error=google_token_failed`);
        return;
      }
      const tokens = (await tokenRes.json()) as { access_token?: string };
      if (!tokens.access_token) {
        res.redirect(`${cfg.appUrl}/auth?error=google_token_failed`);
        return;
      }

      const profileRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      );
      if (!profileRes.ok) {
        res.redirect(`${cfg.appUrl}/auth?error=google_profile_failed`);
        return;
      }
      const googleUser = (await profileRes.json()) as {
        email?: string;
        email_verified?: boolean;
        name?: string;
      };
      if (!googleUser.email || googleUser.email_verified === false) {
        res.redirect(`${cfg.appUrl}/auth?error=google_email_unverified`);
        return;
      }

      const email = googleUser.email.trim().toLowerCase();
      const displayName =
        googleUser.name?.trim().slice(0, 80) || email.split("@")[0] || "Engineer";

      let user = await store.findUserByEmail(email);
      if (!user) {
        user = await store.createUser({
          email,
          name: displayName,
          passwordHash: await hashPassword(randomBytes(32).toString("hex")),
        });
      }

      if (req.principal?.isGuest) {
        await store.adoptGuestRecords(req.principal.ownerId, `user:${user.id}`);
      }

      const token = signJwt({
        id: user.id,
        email: user.email,
        name: user.name,
      });
      res.cookie("nettopo_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 604800000,
        path: "/",
      });
      res.redirect(`${cfg.appUrl}/chat?auth=google`);
    } catch {
      res.redirect(`${cfg.appUrl}/auth?error=google_auth_failed`);
    }
  });

  router.get("/me", requireRegisteredUser, async (req, res, next) => {
    try {
      const user = await store.findUserById(req.principal!.userId!);
      if (!user) {
        throw new HttpError(401, "INVALID_TOKEN", "Account no longer exists.");
      }
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
