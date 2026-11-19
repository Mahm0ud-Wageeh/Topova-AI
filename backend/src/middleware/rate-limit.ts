import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit(options: {
  windowMs: number;
  max: number;
  byAccount?: boolean;
}) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "local";
    const account =
      options.byAccount && typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const key = `${ip}:${account}`;
    if (account) {
      const accountKey = `account:${account}`;
      const accountBucket = buckets.get(accountKey);
      if (
        accountBucket &&
        accountBucket.resetAt > now &&
        accountBucket.count >= options.max
      ) {
        res.setHeader(
          "Retry-After",
          String(Math.ceil((accountBucket.resetAt - now) / 1000)),
        );
        res
          .status(429)
          .json({
            error: {
              code: "RATE_LIMITED",
              message: "Too many sign-in attempts. Try again later.",
            },
          });
        return;
      }
      buckets.set(
        accountKey,
        accountBucket && accountBucket.resetAt > now
          ? { ...accountBucket, count: accountBucket.count + 1 }
          : { count: 1, resetAt: now + options.windowMs },
      );
    }
    const entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      if (buckets.size > 2000) {
        for (const [k, v] of buckets) {
          if (v.resetAt <= now) buckets.delete(k);
        }
      }
      next();
      return;
    }
    entry.count++;
    if (entry.count > options.max) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((entry.resetAt - now) / 1000)),
      );
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down and try again.",
        },
      });
      return;
    }
    next();
  };
}
