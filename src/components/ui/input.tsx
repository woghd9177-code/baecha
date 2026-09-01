import { InputHTMLAttributes, forwardRef, LabelHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 ${className}`}
        {...props}
      />
    );
  },
);

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="mb-1 block text-sm font-medium text-slate-700" {...props} />;
}

export function Field({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>;
}
