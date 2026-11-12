import type { z } from "zod";
import { fieldErrors } from "@/lib/validation";
import { AppError } from "./errors";

/** Validate untrusted input; throws a VALIDATION AppError with per-field messages. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = fieldErrors(result.error);
    throw new AppError(Object.values(errors)[0] ?? "Check the highlighted fields.", "VALIDATION", errors);
  }
  return result.data;
}
