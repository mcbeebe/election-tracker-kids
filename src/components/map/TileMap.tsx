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
              aria-label={t.label}
              className="flex h-full w-full flex-col items-center justify-center no-underline"
              style={{ color: c.color }}
            >
              <span className="text-[11px] font-bold sm:text-[13px]">{t.code}</span>
              <span className="hidden max-w-full px-0.5 font-mono text-[9px] whitespace-nowrap sm:block sm:text-[10px]">{t.sub}</span>
              {t.sub2 && (
                <span className="hidden max-w-full px-0.5 font-mono text-[9px] whitespace-nowrap sm:block sm:text-[10px]">{t.sub2}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
