import fs from "node:fs/promises"
import path from "node:path"
import { hash, stableJson } from "./hash"
import type { ObjectRef } from "../../shared/artifact"

export class ObjectStore {
  constructor(readonly directory: string) {}

  async put(bytes: Uint8Array, contentType: string): Promise<ObjectRef> {
    const digest = hash(bytes)
    const key = `objects/${digest}`
    const filename = path.join(this.directory, key)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    // Objects are immutable; an interrupted write is replaced on the next attempt.
    await fs.writeFile(`${filename}.tmp`, bytes)
    await fs.rename(`${filename}.tmp`, filename)
    return { key, hash: digest, size: bytes.byteLength, contentType }
  }

  json(value: unknown): Promise<ObjectRef> {
    return this.put(Buffer.from(stableJson(value)), "application/json; charset=utf-8")
  }

  read(ref: ObjectRef): Promise<Buffer> {
    return fs.readFile(path.join(this.directory, ref.key))
  }
}

export function contentType(filename: string): string {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".pdf": "application/pdf",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".txt": "text/plain; charset=utf-8",
  }
  return types[path.extname(filename).toLowerCase()] ?? "application/octet-stream"
}
