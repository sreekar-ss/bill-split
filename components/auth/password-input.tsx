"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";

/** Password input with a show/hide toggle. Pass Field's render props straight through. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <span className="relative block">
        <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={props.id}
          className="absolute right-0 top-0 grid size-11 place-items-center rounded-[10px] text-ink-muted hover:text-ink"
        >
          {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
        </button>
      </span>
    );
  },
);
