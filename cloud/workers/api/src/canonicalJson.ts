type StrictJsonPolicy = {
  mode: "strict" | "receipt";
  invalidValue: () => never;
};
type JsonPolicy = StrictJsonPolicy | { mode: "event" } | { mode: "recovery" };

function encode(value: unknown, policy: { mode: "event" }): string | undefined;
function encode(
  value: unknown,
  policy: StrictJsonPolicy | { mode: "recovery" },
): string;
function encode(value: unknown, policy: JsonPolicy): string | undefined;
function encode(value: unknown, policy: JsonPolicy): string | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (
      (policy.mode === "strict" || policy.mode === "receipt") &&
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      const { invalidValue } = policy;
      return invalidValue();
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const child = (value: unknown) => encode(value, policy);
    return `[${(policy.mode === "receipt" ? Array.from(value, child) : value.map(child)).join(",")}]`;
  }
  if (typeof value === "object") {
    if (policy.mode === "receipt") {
      const prototype: unknown = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        const { invalidValue } = policy;
        return invalidValue();
      }
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(record[key], policy)}`)
      .join(",")}}`;
  }
  if (policy.mode === "event") return JSON.stringify(value);
  if (policy.mode === "recovery") return JSON.stringify(value) ?? "";
  const { invalidValue } = policy;
  return invalidValue();
}

export function canonicalJson(
  value: unknown,
  invalidValue: () => never,
): string {
  return encode(value, { mode: "strict", invalidValue });
}

export function canonicalReceiptJson(
  value: unknown,
  invalidValue: () => never,
): string {
  return encode(value, { mode: "receipt", invalidValue });
}

export function canonicalEventRepositoryJson(
  value: unknown,
): string | undefined {
  return encode(value, { mode: "event" });
}

export function canonicalAuthRecoveryJson(value: unknown): string {
  return encode(value, { mode: "recovery" });
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
