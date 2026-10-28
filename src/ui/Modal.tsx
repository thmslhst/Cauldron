import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal dialog on the native <dialog> element (focus trap, Escape to close, backdrop).
 * Its content stays mounted while closed, so state such as the kit list survives.
 */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      // a click on the dialog element itself is a click on the backdrop
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal__inner">
        <header className="modal__head">
          <h2>{title}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </dialog>
  );
}
