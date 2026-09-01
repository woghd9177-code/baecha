export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-brand-100 bg-white p-5 shadow-sm shadow-brand-900/5 ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-brand-900">
      <span className="h-4 w-1 rounded-full bg-gold-400" aria-hidden="true" />
      {children}
    </h2>
  );
}
