export function validateStoredJson(value: unknown, errorMessage: string): void {
  const active = new Set<object>();
  const validate = (nested: unknown, depth: number): void => {
    if (depth > 64) throw new TypeError(errorMessage);
    if (
      nested === null ||
      typeof nested === "string" ||
      typeof nested === "boolean" ||
      (typeof nested === "number" && Number.isFinite(nested))
    ) {
      return;
    }
    if (!nested || typeof nested !== "object" || active.has(nested)) {
      throw new TypeError(errorMessage);
    }
    const prototype = Object.getPrototypeOf(nested);
    if (
      !Array.isArray(nested) &&
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      throw new TypeError(errorMessage);
    }
    active.add(nested);
    for (const value of Object.values(nested)) validate(value, depth + 1);
    active.delete(nested);
  };
  validate(value, 0);
}
