export function createRequestTiming({
  now,
  repeated,
}: {
  now: () => number;
  repeated: "sum" | "replace";
}) {
  const startedAt = now();
  const timings = new Map<string, number>();
  return {
    async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
      const started = now();
      try {
        return await work();
      } finally {
        const duration = Math.max(0, now() - started);
        timings.set(
          name,
          repeated === "sum" ? (timings.get(name) ?? 0) + duration : duration,
        );
      }
    },
    finish(response: Response): Response {
      timings.set("total", Math.max(0, now() - startedAt));
      response.headers.set(
        "Server-Timing",
        Array.from(
          timings,
          ([name, duration]) => `${name};dur=${duration.toFixed(1)}`,
        ).join(", "),
      );
      return response;
    },
  };
}
