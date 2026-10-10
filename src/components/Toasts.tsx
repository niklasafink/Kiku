"use client";

import { X } from "lucide-react";
import { dismissToast, useToasts } from "@/lib/toast";

/** Renders the messages of src/lib/toast.ts; mounted once in the app shell. */
export function Toasts() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toast toast-center z-50 mb-[env(safe-area-inset-bottom)] w-full max-w-md px-4" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="pop-in alert border-2 border-base-300 bg-base-100 shadow-lg">
          <span className="min-w-0 flex-1 text-sm font-semibold">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                dismissToast(toast.id);
                void toast.action!.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-square btn-xs" aria-label="Schließen" onClick={() => dismissToast(toast.id)}>
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
