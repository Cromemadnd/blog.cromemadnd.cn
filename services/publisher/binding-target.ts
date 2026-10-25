import type { D1Database, R2Bucket } from "@cloudflare/workers-types"
import type { ObjectRef } from "../../shared/artifact"
import type { PublishTarget, QueryResult, SqlStatement } from "./target"

/** Connects the publisher to Wrangler's local workerd-backed D1/R2 bindings. */
export class BindingTarget implements PublishTarget {
  constructor(
    private db: D1Database,
    private bucket: R2Bucket,
  ) {}

  async query<T = Record<string, unknown>>(statement: SqlStatement): Promise<QueryResult<T>> {
    const result = await this.db
      .prepare(statement.sql)
      .bind(...(statement.params ?? []))
      .all<T>()
    if (!result.success) throw new Error("D1 binding query failed")
    return result
  }

  async batch(statements: SqlStatement[]): Promise<QueryResult[]> {
    const results = await this.db.batch<Record<string, unknown>>(
      statements.map((statement) =>
        this.db.prepare(statement.sql).bind(...(statement.params ?? [])),
      ),
    )
    if (results.some((result) => !result.success)) throw new Error("D1 binding batch failed")
    return results
  }

  async putObject(ref: ObjectRef, bytes: Uint8Array): Promise<boolean> {
    const existing = await this.bucket.head(ref.key)
    if (existing) {
      if (existing.size !== ref.size || existing.customMetadata?.sha256 !== ref.hash)
        throw new Error(`Local R2 object integrity check failed: ${ref.key}`)
      return false
    }
    await this.bucket.put(ref.key, new Uint8Array(bytes).buffer, {
      httpMetadata: { contentType: ref.contentType },
      customMetadata: { sha256: ref.hash },
    })
    return true
  }
}
