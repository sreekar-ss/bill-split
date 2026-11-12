"use client";


import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils/cn";

const control =
  "w-full rounded-[10px] border border-field bg-surface px-3 text-[1rem] text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus aria-[invalid=true]:border-owe disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(control, "min-h-20 py-2.5", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, "h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2355627a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-body-sm font-semibold text-ink", className)} {...props} />;
}

/**
 * Label + control + hint/error. The child receives id/aria props via render function:
 *   <Field label="Email" error={e}>{(p) => <Input {...p} type="email" />}</Field>
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-meta font-medium text-owe">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-meta text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" tabIndex={-1} data-form-error className="rounded-[10px] border border-owe/30 bg-owe/5 px-3 py-2 text-body-sm text-owe">
      {message}
    </p>
  );
}
