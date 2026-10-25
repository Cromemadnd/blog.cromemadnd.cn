import { createHash } from "node:crypto"

export function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    }
    return item
  })
}
