import "server-only";
import { DrizzleQueryError } from "drizzle-orm";

// O Drizzle embrulha o erro do `pg`; o código SQLSTATE vem na causa.
function codigoSql(error: unknown) {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause
    ? cause.code
    : undefined;
}

// 23505: unique_violation.
export function isUniqueViolation(error: unknown) {
  return codigoSql(error) === "23505";
}

// 23503: foreign_key_violation (ex.: apagar algo ainda referenciado).
export function isForeignKeyViolation(error: unknown) {
  return codigoSql(error) === "23503";
}
