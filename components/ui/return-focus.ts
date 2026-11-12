"use client";

import { useLayoutEffect, useRef } from "react";

const FOCUSABLE = "button, a[href], input, select, textarea, [tabindex]";

/**
 * Taps don't always move focus to the button that was tapped (mobile Safari, touch emulation), so
 * the element that last received a pointer press is remembered as well as `document.activeElement`.
 */
let lastPress: { el: HTMLElement; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>(FOCUSABLE) : null;
      lastPress = el ? { el, at: Date.now() } : null;
    },
    true,
  );
}

function openerElement(): HTMLElement | null {
  if (lastPress && Date.now() - lastPress.at < 1000 && lastPress.el.isConnected) return lastPress.el;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Our sheets and dialogs are controlled (opened from a plain onClick, not a Radix Trigger), so Radix
 * has no trigger to send focus back to and drops it on <body> when they close. This remembers what
 * opened them when `open` turned true and returns focus there on close. If that element is gone
 * (e.g. the row that opened it was deleted), focus goes to the page heading instead.
 *
 * Pass the returned handler as `onCloseAutoFocus` on Dialog.Content / AlertDialog.Content.
 */
export function useReturnFocus(open: boolean) {
  const saved = useRef<HTMLElement | null>(null);

  // Layout effect: runs before Radix moves focus into the (portalled) content.
  useLayoutEffect(() => {
    if (open) saved.current = openerElement();
  }, [open]);

  return (event: Event) => {
    event.preventDefault();
    const target = saved.current;
    saved.current = null;
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }
    focusPageHeading();
  };
}

function focusPageHeading() {
  const heading = document.querySelector<HTMLElement>("main h1");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}
