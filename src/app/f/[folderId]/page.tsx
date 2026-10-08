"use client";

import { useParams } from "next/navigation";
import { FolderView } from "@/components/FolderView";

export default function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  return <FolderView key={folderId} folderId={folderId} />;
}
