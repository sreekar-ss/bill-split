"use client";

import { useEffect, useRef } from "react";

/**
 * After a failed submit, moves focus to the first invalid field (or the form error),
 * so keyboard and screen-reader users land on what needs fixing.
 */
export function useFocusFirstError<T>(result: T) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!result) return;
    const form = formRef.current;
    // Prefer the field (its error is read out through aria-describedby), then a form-level error.
    const target =
      form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>("[data-form-error]");
    target?.focus();
  }, [result]);
  return formRef;
}
