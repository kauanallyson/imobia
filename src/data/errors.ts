import "server-only";
import { DrizzleQueryError } from "drizzle-orm";

// O Drizzle embrulha o erro do `pg`; o código SQLSTATE 23505 é unique_violation.
export function isUniqueViolation(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "23505"
  );
}
