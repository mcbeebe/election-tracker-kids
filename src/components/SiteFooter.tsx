/**
 * Footer on every page: data attribution (civicAPI requires it for non-personal use, and the
 * site is public) and the provenance rules.
 */
export function SiteFooter() {
  return (
    <footer className="w-full border-t border-[#E2E0D8] bg-white px-4 pt-4 pb-6 text-xs text-[#5B6274] sm:px-8">
      Data:{" "}
      <a href="https://civicapi.org" className="font-semibold text-[#2F5FA6]" rel="noopener noreferrer" target="_blank">
        civicAPI
      </a>{" "}
      (unverified third party; not affiliated with this site). &ldquo;Called&rdquo; is civicAPI&apos;s own winner flag —
      never this app&apos;s projection. % reporting is precinct-based.
    </footer>
  );
}
