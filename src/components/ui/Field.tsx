import type { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

/**
 * A single text/number input. Font size is pinned at 16px no matter the type
 * scale — anything smaller makes iOS Safari zoom the viewport on focus, which
 * reads as a broken app. Callers should still pass `inputMode`/`enterKeyHint`
 * for numeric fields (this component doesn't guess those from `type`).
 */
export function Field({ label, hint, id, className = "", ...rest }: FieldProps) {
  const inputId = id ?? rest.name;

  return (
    <label htmlFor={inputId} className="block">
      {label && (
        <span className="mb-1.5 block text-caption text-ink-muted">{label}</span>
      )}
      <input
        id={inputId}
        className={`w-full min-h-11 rounded-row border border-glass-1-border bg-glass-1 px-4 text-ink placeholder:text-ink-faint outline-none focus:border-sage/50 ${className}`}
        style={{ fontSize: 16 }}
        {...rest}
      />
      {hint && <span className="mt-1.5 block text-caption text-ink-faint">{hint}</span>}
    </label>
  );
}
