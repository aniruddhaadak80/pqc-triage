import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/**
 * One error shape for every endpoint and every tool call, so a client never has
 * to guess. Codes are stable strings; the HTTP status is derived from the code.
 */

export type ApiErrorCode =
  | "validation_error"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "forbidden"
  | "unsupported_media_type"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  validation_error: 422,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  forbidden: 403,
  unsupported_media_type: 415,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details ?? null;
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export function errorBody(error: ApiError): { error: { code: string; message: string; details: unknown } } {
  return { error: { code: error.code, message: error.message, details: error.details } };
}

type ErrorLike = ApiError | { code: ApiErrorCode; message: string; details?: unknown };

function toApiError(error: ErrorLike): ApiError {
  return error instanceof ApiError ? error : new ApiError(error.code, error.message, error.details);
}

export function fail(error: ErrorLike): NextResponse {
  return NextResponse.json(errorBody(toApiError(error)), { status: toApiError(error).status });
}

export function failFrom(error: unknown): NextResponse {
  if (error instanceof ApiError) return fail(error);
  if (error instanceof ZodError) {
    return fail(
      new ApiError(
        "validation_error",
        "The request body did not match the schema.",
        error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      ),
    );
  }
  return fail(new ApiError("internal_error", "The server could not complete that request."));
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("validation_error", "The request body was not valid JSON.");
  }
  return schema.parse(raw);
}

/** Wrap a handler so an unexpected throw becomes a clean envelope, never a stack trace. */
export function route<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return failFrom(error);
    }
  };
}

export const LIMITS = {
  manifestChars: 200_000,
  sourceChars: 200_000,
  nameChars: 120,
  noteChars: 1_000,
  noteInputChars: 600,
} as const;

export const SHORT_TEXT_MAX = 4_000;