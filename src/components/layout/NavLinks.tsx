"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/offices", label: "사무실" },
  { href: "/admin/work-types", label: "작업유형 설정" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 text-sm">
      {NAV_LINKS.map((link) => {
        const active = pathname?.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              active ? "bg-gold-400 text-brand-900" : "text-brand-50 hover:bg-brand-700"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
