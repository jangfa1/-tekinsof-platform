import type { z } from "zod";

// One envelope for every service result and every JSON route (blueprint §5).
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "CAPTCHA_FAILED"
  | "ORIGIN_NOT_ALLOWED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "APPROVAL_REQUIRED"
  | "INTERNAL";

export type AppError = { code: ErrorCode; message: string; fields?: Record<string, string> };
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const httpStatus: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  CAPTCHA_FAILED: 403,
  ORIGIN_NOT_ALLOWED: 403,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  APPROVAL_REQUIRED: 409,
  INTERNAL: 500,
};

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): Result<never> {
  return { ok: false, error: fields ? { code, message, fields } : { code, message } };
}

export function validationError(error: z.ZodError): Result<never> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return err("VALIDATION_ERROR", "Datos inválidos", fields);
}
