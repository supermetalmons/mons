export type WagerD1Interceptor = (
  execute: () => Promise<unknown>,
  query: string,
  method: "first" | "run" | "all",
) => Promise<unknown>;

export function isWagerAdmissionInsert(query: string): boolean {
  return /^\s*INSERT INTO wager_reservation_write_admissions\b/i.test(query);
}

export function observeWagerAdmissionDatabase(
  db: D1Database,
  intercept: WagerD1Interceptor = (execute) => execute(),
) {
  const sessions: Parameters<D1Database["withSession"]>[0][] = [];
  const queries: string[] = [];
  const wrap = (
    statement: D1PreparedStatement,
    query: string,
  ): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, property) {
        if (property === "bind")
          return (...values: unknown[]) => wrap(target.bind(...values), query);
        if (property === "first" || property === "run" || property === "all")
          return async (...args: unknown[]) => {
            queries.push(query);
            return intercept(
              () => Reflect.apply(target[property], target, args),
              query,
              property,
            );
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  const database = new Proxy(db, {
    get(target, property) {
      if (property === "prepare")
        return (query: string) => wrap(target.prepare(query), query);
      if (property === "withSession")
        return (...args: Parameters<D1Database["withSession"]>) => {
          sessions.push(args[0]);
          const session = target.withSession(...args);
          return new Proxy(session, {
            get(current, key) {
              if (key === "prepare")
                return (query: string) => wrap(current.prepare(query), query);
              const value = Reflect.get(current, key, current);
              return typeof value === "function" ? value.bind(current) : value;
            },
          });
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { database, sessions, queries };
}
