"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home", key: "01" },
  { href: "/lab", label: "Lab", key: "02" },
  { href: "/security", label: "Security", key: "03" },
  { href: "/career", label: "Career", key: "04" },
  { href: "/games", label: "Games", key: "05" },
  { href: "/family", label: "Family", key: "06" },
  { href: "/system", label: "System", key: "07" },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_96%,var(--bg))] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
      <div className="hidden h-16 items-center border-b border-[var(--line)] px-5 lg:flex">
        <div>
          <div className="mono text-[13px] font-bold tracking-[0.13em]">HOMEBASE</div>
          <div className="mono mt-1 text-[8px] tracking-[0.22em] text-[var(--faint)]">PRIVATE COMMAND SYSTEM</div>
        </div>
      </div>
      <nav aria-label="Primary" className="scrollbar-thin flex overflow-x-auto px-2 lg:block lg:flex-1 lg:px-3 lg:py-5">
        {links.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex shrink-0 items-center gap-3 rounded-lg border px-3 py-3 text-xs uppercase tracking-[0.12em] lg:mb-1 lg:px-3 lg:py-2.5 ${
                active
                  ? "border-[color-mix(in_srgb,var(--cyan)_48%,var(--line))] bg-[color-mix(in_srgb,var(--cyan)_11%,var(--panel-raised))] text-[var(--text)]"
                  : "border-transparent text-[var(--muted)] hover:bg-[var(--panel-raised)] hover:text-[var(--text)]"
              }`}
            >
              <span className={`mono text-[9px] ${active ? "text-[var(--cyan)]" : "text-[var(--faint)]"}`}>
                {link.key}
              </span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t border-[var(--line)] p-4 lg:block">
        <div className="section-label">Runtime</div>
        <div className="mono mt-2 flex justify-between text-[10px] text-[var(--muted)]">
          <span>ENV</span>
          <span className="text-[var(--cyan)]">LOCAL</span>
        </div>
        <div className="mono mt-1.5 flex justify-between text-[10px] text-[var(--muted)]">
          <span>DATA</span>
          <span className="text-[var(--amber)]">PER WORKSPACE</span>
        </div>
      </div>
    </aside>
  );
}
