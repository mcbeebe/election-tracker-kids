import Link from "next/link";
import { type TileModel, tileColors } from "@/lib/view/tiles";

/** Props for {@link TileMap}. */
export interface TileMapProps {
  tiles: TileModel[];
  /** Accessible name for the whole map, e.g. "Senate races by state". */
  label: string;
}

/**
 * 11×8 tile-grid state map (positions from the Option B mockup). Each tile links to its
 * state page and carries a full-sentence label, so the map is usable without seeing color.
 */
export function TileMap({ tiles, label }: TileMapProps) {
  return (
    <ul
      aria-label={label}
      className="grid list-none grid-cols-[repeat(11,minmax(0,1fr))] grid-rows-[repeat(8,minmax(30px,48px))] gap-[3px] p-0 sm:gap-[5px]"
    >
      {tiles.map((t) => {
        const c = tileColors(t);
        // Text on hatching is hard to read; give it a light backing so the stripes stay visible around it.
        const chip = t.state === "leading" ? "rounded-sm bg-white/85 leading-tight" : "";
        return (
          <li
            key={t.code}
            title={t.label}
            data-state={t.state}
            className="flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-[5px] border leading-tight"
            style={{ gridColumn: t.col, gridRow: t.row, background: c.background, borderColor: c.border, color: c.color }}
          >
            <Link
              href={`/state/${t.code}`}
              className="flex h-full w-full flex-col items-center justify-center no-underline"
              style={{ color: c.color }}
            >
              <span className={`text-[11px] font-bold sm:text-[13px] ${chip}`}>{t.code}</span>
              <span className={`hidden max-w-full px-0.5 font-mono text-[9px] whitespace-nowrap sm:block sm:text-[10px] ${chip}`}>{t.sub}</span>
              {t.sub2 && (
                <span className={`hidden max-w-full px-0.5 font-mono text-[9px] whitespace-nowrap sm:block sm:text-[10px] ${chip}`}>{t.sub2}</span>
              )}
              {/* Full sentence for screen readers, appended so the accessible name always contains the visible text (WCAG 2.5.3). */}
              <span className="sr-only">. {t.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
