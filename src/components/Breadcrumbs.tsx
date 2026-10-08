import Link from "next/link";
import { pathTo } from "@/lib/tree";
import type { Folder } from "@/lib/types";

/** Path from the library down to (and including) the given folder, all as links. */
export function Breadcrumbs({ folders, folderId }: { folders: Folder[]; folderId: string | null }) {
  const path = folderId ? pathTo(folders, folderId) : [];
  return (
    <nav aria-label="Pfad" className="breadcrumbs max-w-full py-0 text-sm font-semibold opacity-70">
      <ul>
        <li>
          <Link href="/">Bibliothek</Link>
        </li>
        {path.map((folder) => (
          <li key={folder.id}>
            <Link href={`/f/${folder.id}`}>{folder.name}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
