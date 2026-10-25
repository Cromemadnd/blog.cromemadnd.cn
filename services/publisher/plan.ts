export interface SourceInfo {
  hash: string
  mtimeMs: number
  birthtimeMs: number
}

export interface Dependency {
  source: string
  target: string
  type: "embed" | "link" | "asset"
}

export function changedPaths(
  previous: Record<string, SourceInfo>,
  next: Record<string, SourceInfo>,
): string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((key) => {
      const a = previous[key]
      const b = next[key]
      return !a || !b || a.hash !== b.hash || a.mtimeMs !== b.mtimeMs || a.birthtimeMs !== b.birthtimeMs
    })
    .sort()
}

/** Both graphs matter: deleted targets and removed edges still invalidate their old parents. */
export function affectedPages(
  changed: Iterable<string>,
  previous: Dependency[],
  next: Dependency[],
): Set<string> {
  const reverse = new Map<string, Set<string>>()
  for (const edge of [...previous, ...next]) {
    if (edge.type === "link") continue
    const parents = reverse.get(edge.target) ?? new Set<string>()
    parents.add(edge.source)
    reverse.set(edge.target, parents)
  }
  const affected = new Set(changed)
  const queue = [...affected]
  for (let i = 0; i < queue.length; i++) {
    for (const parent of reverse.get(queue[i]) ?? []) {
      if (!affected.has(parent)) {
        affected.add(parent)
        queue.push(parent)
      }
    }
  }
  return affected
}
