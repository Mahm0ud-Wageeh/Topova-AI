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
