import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pathTo } from "@/lib/tree";
import type { Folder } from "@/lib/types";

/**
 * Path from the library down to (and including) the given folder, all as links, led by a back
 * arrow to the last of them: the place one level up from the page that shows the path.
 */
export function Breadcrumbs({ folders, folderId }: { folders: Folder[]; folderId: string | null }) {
  const path = folderId ? pathTo(folders, folderId) : [];
  const parent = path.at(-1);
  return (
    <div className="flex max-w-full items-center gap-1">
      <Link
        href={parent ? `/f/${parent.id}` : "/"}
        className="btn btn-ghost btn-sm btn-square -ml-2 shrink-0"
        aria-label={`Zurück zu ${parent ? parent.name : "Bibliothek"}`}
      >
        <ArrowLeft className="size-5" />
      </Link>
      <nav aria-label="Pfad" className="breadcrumbs min-w-0 py-0 text-sm font-semibold opacity-70">
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
    </div>
  );
}
