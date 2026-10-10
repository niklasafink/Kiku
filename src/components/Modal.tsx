"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FULL =
  "flex h-dvh max-h-dvh w-full max-w-none flex-col rounded-none sm:h-[min(92dvh,60rem)] sm:w-[min(96vw,84rem)] sm:rounded-box";

export function Modal({
  open,
  onClose,
  title,
  wide,
  full,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Roomier box for side-by-side forms. */
  wide?: boolean;
  /** Fills almost the whole screen, for writing longer texts. Children lay out in a column. */
  full?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal modal-bottom sm:modal-middle" onClose={onClose}>
      <div className={`modal-box ${full ? FULL : wide ? "sm:w-11/12 sm:max-w-4xl" : ""}`}>
        <div className="mb-4 flex items-start gap-3">
          <h3 className="min-w-0 flex-1 text-xl font-extrabold break-words">{title}</h3>
          {full && (
            <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label="Schließen" onClick={onClose}>
              <X className="size-5" />
            </button>
          )}
        </div>
        {/* Mounted only while open so form state resets each time. */}
        {open && children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Schließen" />
      </form>
    </dialog>
  );
}
