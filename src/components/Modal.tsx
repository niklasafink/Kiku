"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Roomier box for side-by-side forms. */
  wide?: boolean;
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
      <div className={`modal-box ${wide ? "sm:w-11/12 sm:max-w-4xl" : ""}`}>
        <h3 className="mb-4 text-xl font-extrabold">{title}</h3>
        {/* Mounted only while open so form state resets each time. */}
        {open && children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Schließen" />
      </form>
    </dialog>
  );
}
