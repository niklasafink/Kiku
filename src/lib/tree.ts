import type { Folder } from "./types";

export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Ids of the folder itself and everything nested below it. */
export function descendantIds(folders: Folder[], id: string): string[] {
  const result: string[] = [];
  const queue = [id];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    for (const f of folders) {
      if (f.parentId === current) queue.push(f.id);
    }
  }
  return result;
}

/** Path from the root down to the folder (inclusive). Empty if the folder is unknown. */
export function pathTo(folders: Folder[], id: string): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** All folders as picker options, labelled with their full path and sorted by it. */
export function folderOptions(folders: Folder[]): { id: string; label: string }[] {
  return folders
    .map((f) => ({ id: f.id, label: pathTo(folders, f.id).map((p) => p.name).join(" › ") }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}
