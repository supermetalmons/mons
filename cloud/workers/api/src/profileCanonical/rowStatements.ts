import type { D1Value } from "./types.ts";

export function canonicalRowMutationStatement<
  Row extends Record<string, D1Value>,
>(
  db: D1Database,
  table:
    | "profile_records"
    | "rating_updates"
    | "profile_auth_methods"
    | "profile_auth_operations"
    | "profile_auth_method_revocations"
    | "profile_auth_method_cooldowns"
    | "profile_auth_recovery_jobs",
  keyColumn:
    | (keyof Row & string)
    | readonly [keyof Row & string, ...(keyof Row & string)[]],
  row: Row,
  insert: boolean,
  current?: Row,
): D1PreparedStatement {
  const fields = Object.entries(row);
  if (insert) {
    return db
      .prepare(
        `INSERT INTO ${table} (${fields.map(([column]) => column).join(", ")}, revision)
         VALUES (${fields.map(() => "?").join(", ")}, 1)`,
      )
      .bind(...fields.map(([, value]) => value));
  }
  const keyColumns = typeof keyColumn === "string" ? [keyColumn] : keyColumn;
  const keys = new Set<string>(keyColumns);
  const updates = fields.filter(
    ([column, value]) =>
      !keys.has(column) && (!current || current[column] !== value),
  );
  return db
    .prepare(
      `UPDATE ${table} SET
         ${[...updates.map(([column]) => `${column} = ?`), "revision = revision + 1"].join(", ")}
       WHERE ${keyColumns.map((column) => `${column} = ?`).join(" AND ")}`,
    )
    .bind(
      ...updates.map(([, value]) => value),
      ...keyColumns.map((column) => row[column]),
    );
}
