import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "./errors";

/** For Server Components: turn a service's NOT_FOUND/FORBIDDEN into Next's 404 page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }
}
