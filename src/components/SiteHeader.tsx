import Link from "next/link";
import { SourceBadge } from "./SourceBadge";

/** Props for {@link SiteHeader}. */
export interface SiteHeaderProps {
  source: string;
  asOf: string | null;
  stale: boolean;
  nextIn: number;
  current: "national" | "measures" | "state";
}

const LINKS = [
  { href: "/", label: "National", id: "national" },
  { href: "/measures", label: "Ballot measures", id: "measures" },
] as const;

/** Shared header: title, nav, source badge with "as of", and next-refresh countdown. */
export function SiteHeader({ source, asOf, stale, nextIn, current }: SiteHeaderProps) {
  return (
    <header className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#E2E0D8] bg-white px-4 py-3 sm:px-8">
      <Link href="/" className="font-serif text-[22px] font-bold text-[#1B1F2A] no-underline">
        Midterm Tracker
      </Link>
      <nav aria-label="Sections" className="flex gap-4 text-sm font-semibold">
        {LINKS.map((l) => (
          <Link
            key={l.id}
            href={l.href}
            aria-current={current === l.id ? "page" : undefined}
            className={`flex min-h-9 items-center no-underline ${current === l.id ? "text-[#2F5FA6]" : "text-[#5B6274]"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        <SourceBadge source={source} asOf={asOf} stale={stale} />
        <span className="font-mono text-xs text-[#5B6274]">next update in {nextIn}s</span>
      </div>
    </header>
  );
}
