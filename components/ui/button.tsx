import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-surface hover:bg-ink/90",
        secondary: "border border-field bg-surface text-ink hover:bg-paper",
        ghost: "text-ink hover:bg-ink/5",
        destructive: "border border-field bg-surface text-owe hover:bg-owe/5",
        danger: "bg-owe text-on-owe hover:bg-owe/90",
        highlight: "bg-highlight text-highlight-ink shadow-lift hover:brightness-95",
      },
      size: {
        sm: "h-9 px-3 text-body-sm",
        md: "h-11 px-4 text-[1rem]",
        lg: "h-12 px-5 text-[1rem]",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp ref={ref} type={asChild ? undefined : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
