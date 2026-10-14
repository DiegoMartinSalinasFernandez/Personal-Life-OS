import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "nutrition";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary/90 active:bg-primary/80 shadow-card",
  secondary: "bg-surface text-ink border border-line hover:bg-subtle hover:border-line-strong active:bg-muted",
  ghost: "text-ink-2 hover:text-ink hover:bg-muted active:bg-line/60",
  subtle: "bg-muted text-ink hover:bg-line/70",
  danger: "bg-negative text-white hover:bg-negative/90 active:bg-negative/80",
  nutrition: "bg-nutrition text-white hover:bg-nutrition/90 active:bg-nutrition/80 shadow-card dark:text-[rgb(20_20_23)]",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-sm gap-1.5 rounded",
  md: "h-9 px-3.5 text-base gap-2 rounded-md",
  lg: "h-11 px-5 text-md gap-2 rounded-md",
  icon: "h-9 w-9 rounded-md",
  "icon-sm": "h-7 w-7 rounded",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 select-none",
        "disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
});
