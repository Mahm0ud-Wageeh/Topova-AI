import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { PoolCapacityError } from "@/lib/design/branch";
import { BranchChangeError } from "@/lib/design/change";
import { CiscoExportError } from "@server/cisco-export";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res
      .status(err.status)
      .json({
        error: { code: err.code, message: err.message, ...err.details },
      });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "INVALID_DESIGN",
        message: "Check the request payload fields.",
        fieldIssues: err.issues.map(({ path, message }) => ({ path, message })),
      },
    });
    return;
  }

  if (err instanceof PoolCapacityError) {
    res.status(422).json({
      error: {
        code: "POOL_CAPACITY",
        message: err.message,
        requiredAddresses: err.requiredAddresses,
        availableAddresses: err.availableAddresses,
      },
    });
    return;
  }

  if (err instanceof BranchChangeError) {
    res.status(422).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof CiscoExportError) {
    res
      .status(422)
      .json({
        error: { code: "CISCO_PROFILE_MISMATCH", message: err.message },
      });
    return;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    res
      .status(413)
      .json({
        error: {
          code: "BODY_TOO_LARGE",
          message: "Request body exceeds size limit.",
        },
      });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res
      .status(400)
      .json({
        error: { code: "INVALID_JSON", message: "Send a valid JSON payload." },
      });
    return;
  }

  console.error(
    `[api:${req.requestId ?? "-"}] Unhandled error:`,
    err instanceof Error ? err.message : err,
  );
  res
    .status(500)
    .json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred.",
      },
    });
}
