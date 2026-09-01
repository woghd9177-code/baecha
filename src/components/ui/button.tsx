import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "accent" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white shadow-sm hover:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none",
  secondary:
    "bg-white text-brand-800 border border-brand-200 shadow-sm hover:bg-brand-50 disabled:opacity-50 disabled:shadow-none",
  accent:
    "bg-gold-400 text-brand-900 shadow-sm hover:bg-gold-300 disabled:bg-gold-100 disabled:shadow-none",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-300 disabled:shadow-none",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
});
