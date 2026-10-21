import React from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n';
import { Card, CardActions, CardButton } from './Card';

/**
 * A name to type in, in the card shell: the name of a new window in a project, of a new project, of a folder in the
 * list. The text is given back when it is confirmed; an empty name confirms nothing (the button stays quiet).
 */
export function NameDialog({
  open,
  title,
  description,
  initialValue = '',
  placeholder,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** what the field holds when the dialog opens */
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** the name that was typed; it is not trimmed here (the server cleans it) */
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    /* the field is what the dialog is for: it takes the focus, and the name is selected, so typing replaces it */
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        const target = e.target as Node | null;
        if (target && dialogRef.current?.contains(target)) {
          if (target instanceof HTMLButtonElement && target !== inputRef.current) return;
          e.preventDefault();
          if (value.trim()) onConfirm(value);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValue, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      style={{ animation: 'openfilm-rise 0.16s ease-out both' }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[420px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <Card title={title} body={description} onClose={onCancel}>
          <input
            ref={inputRef}
            value={value}
            spellCheck={false}
            placeholder={placeholder}
            aria-label={title}
            onChange={(e) => setValue(e.target.value)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text-faint)]"
          />
          <CardActions>
            <CardButton ref={cancelButtonRef} weight="quiet" onClick={onCancel}>
              {cancelLabel ?? t('confirm.cancel')}
            </CardButton>
            <CardButton weight="primary" disabled={!value.trim()} onClick={() => onConfirm(value)}>
              {confirmLabel ?? t('confirm.ok')}
            </CardButton>
          </CardActions>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
