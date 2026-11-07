import { formatPt } from "@/lib/view/format";

/** Props for {@link StatusBanners}. */
export interface StatusBannersProps {
  fixtures: boolean;
  stale: boolean;
  oldest: string | null;
  failing: string[];
}

/** Dev-fixture notice, stale-data warning and upstream-failure notice. */
export function StatusBanners({ fixtures, stale, oldest, failing }: StatusBannersProps) {
  return (
    <>
      {fixtures && (
        <div role="note" className="w-full border-b border-[#C9B8F0] bg-[#F1ECFF] px-4 py-2 text-sm sm:px-8">
          Development mode: replaying recorded civicAPI responses. Each panel&apos;s &ldquo;as of&rdquo; is when it was
          recorded. Not live results.
        </div>
      )}
      {(stale || failing.length > 0) && (
        <div role="status" className="w-full border-b border-[#E9D8A6] bg-[#FFF7E0] px-4 py-2 text-sm sm:px-8">
          {stale ? `Data may be out of date — last update ${formatPt(oldest)}. ` : ""}
          {failing.length > 0
            ? `civicAPI is not responding for ${failing.join(", ")}; showing the last good data and retrying.`
            : ""}
        </div>
      )}
    </>
  );
}
