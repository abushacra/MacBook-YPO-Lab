"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: "home" | "clipboard" | "receipt" | "gear" };

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const items: Item[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/calls", label: "Calls", icon: "clipboard" },
    { href: "/expenses", label: "Receipts", icon: "receipt" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "gear" } as const] : []),
  ];

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                  active ? "text-brand-700" : "text-muted"
                }`}
              >
                <NavIcon name={item.icon} filled={active} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavIcon({ name, filled }: { name: Item["icon"]; filled: boolean }) {
  const paths: Record<Item["icon"], string> = {
    home: "M3.5 10.6 12 4l8.5 6.6V19a1.5 1.5 0 0 1-1.5 1.5h-3.5V14h-5v6.5H5A1.5 1.5 0 0 1 3.5 19z",
    clipboard:
      "M9 4.5h6M8 6.5H6.5A1.5 1.5 0 0 0 5 8v11.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H16M9 3.5h6v3H9zM8.5 11.5h7M8.5 15.5h4.5",
    receipt: "M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6L8.4 20.5 6 18.9zM9.5 8.5h5M9.5 12.5h5",
    gear: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.3 7.3 0 0 0-2-1.2l-.3-2.5h-4l-.3 2.5a7.3 7.3 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.3 7.3 0 0 0 2 1.2l.3 2.5h4l.3-2.5a7.3 7.3 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z",
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 2.1 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
