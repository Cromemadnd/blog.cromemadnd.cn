import fs from "node:fs/promises"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { ObjectRef } from "../../shared/artifact"
import type { PublishTarget, QueryResult, SqlStatement } from "./target"

/** Uses the production SQL schema and object layout without network credentials. */
export class LocalTarget implements PublishTarget {
  readonly db: DatabaseSync

  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(path.join(directory, "d1.sqlite"))
  }

  async migrate(): Promise<void> {
    this.db.exec(await fs.readFile("apps/worker/migrations/0001_releases.sql", "utf8"))
  }

  async query<T = Record<string, unknown>>(statement: SqlStatement): Promise<QueryResult<T>> {
    const prepared = this.db.prepare(statement.sql)
    const params = statement.params ?? []
    if (/^\s*(SELECT|WITH)\b/i.test(statement.sql))
      return { results: prepared.all(...params) as T[] }
    const result = prepared.run(...params)
    return { results: [], meta: { changes: Number(result.changes) } }
  }

  async batch(statements: SqlStatement[]): Promise<QueryResult[]> {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const result = []
      for (const statement of statements) result.push(await this.query(statement))
      this.db.exec("COMMIT")
      return result
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  async putObject(ref: ObjectRef, bytes: Uint8Array): Promise<boolean> {
    const filename = path.join(this.directory, "r2", ref.key)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    try {
      await fs.writeFile(filename, bytes, { flag: "wx" })
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const existing = await fs.readFile(filename)
      if (!existing.equals(Buffer.from(bytes)))
        throw new Error(`Corrupt immutable object: ${ref.key}`)
      return false
    }
  }
}
