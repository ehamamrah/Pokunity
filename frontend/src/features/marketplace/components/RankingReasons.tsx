/** "Why this?" hints from the server's ranking.reasons, collapsed by default. */
export function RankingReasons({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <details className="group px-4 pb-4 text-xs text-slate-600">
      <summary className="cursor-pointer select-none font-medium text-teal-800 hover:underline">
        Why this?
      </summary>
      <ul className="mt-2 list-disc space-y-1 ps-5">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </details>
  );
}
