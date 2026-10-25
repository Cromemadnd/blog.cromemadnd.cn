import type { ObjectRef } from "../../shared/artifact"

export interface SqlStatement {
  sql: string
  params?: (string | number | null)[]
}
export interface QueryResult<T = Record<string, unknown>> {
  results: T[]
  meta?: { changes?: number }
}

export interface PublishTarget {
  query<T = Record<string, unknown>>(statement: SqlStatement): Promise<QueryResult<T>>
  batch(statements: SqlStatement[]): Promise<QueryResult[]>
  /** Must finish writing before resolving. Content-addressed keys must never be overwritten. */
  putObject(ref: ObjectRef, bytes: Uint8Array): Promise<boolean>
}

export async function activeRelease(target: PublishTarget): Promise<string | null> {
  const result = await target.query<{ active_release: string | null }>({
    sql: "SELECT active_release FROM site_state WHERE id = 1",
  })
  return result.results[0]?.active_release ?? null
}
