import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-activities focus:outline-none focus:ring-2 focus:ring-activities/20 disabled:opacity-50 aria-[invalid=true]:border-negative aria-[invalid=true]:focus:ring-negative/20";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, "py-2 leading-5", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-9 appearance-none pr-8", className)} {...rest}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});

export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink-2", className)} {...rest} />;
}

/** Label + control + hint/error, wiring ids and aria attributes. */
export function Field({ label, hint, error, children, className, optional }: { label: string; hint?: React.ReactNode; error?: string; children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode; className?: string; optional?: boolean }) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className={className}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1 font-normal text-ink-3">(optional)</span> : null}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error || hint ? descId : undefined })}
      {error ? (
        <p id={descId} className="mt-1 text-caption text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="mt-1 text-caption text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className, disabled, size = "md", tone = "activities", ...rest }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string; disabled?: boolean; size?: "sm" | "md"; tone?: "activities" | "nutrition" | "finance" | "ink" } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange">) {
  const toneCls = { activities: "bg-activities border-activities", nutrition: "bg-nutrition border-nutrition", finance: "bg-finance border-finance", ink: "bg-ink border-ink" }[tone];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-[1.5px] transition-all duration-150",
        size === "sm" ? "size-4" : "size-[18px]",
        checked ? cn(toneCls, "text-white") : "border-line-strong bg-surface hover:border-ink-3",
        className,
      )}
      {...rest}
    >
      {checked ? (
        <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-base font-medium text-ink">
          {label}
        </label>
        {description ? <p className="text-sm text-ink-3">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40", checked ? "bg-ink" : "bg-line-strong")}
      >
        <span className={cn("absolute left-0 top-[3px] size-4 rounded-full bg-surface shadow transition-transform", checked ? "translate-x-[19px]" : "translate-x-[3px]")} />
      </button>
    </div>
  );
}

/** Text input for amounts with a currency adornment; parsing happens in the schema. */
export const MoneyInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { currency: string }>(function MoneyInput({ currency, className, ...rest }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-3">{currency}</span>
      <input ref={ref} inputMode="decimal" autoComplete="off" className={cn(control, "num h-9 pl-12", className)} {...rest} />
    </div>
  );
});
