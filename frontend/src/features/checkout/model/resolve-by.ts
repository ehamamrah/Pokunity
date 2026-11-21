/** "by 14:05": the reconciliation deadline in the viewer's local time, or null when there is none. */
export function resolveByLabel(resolveBy: string | null | undefined): string | null {
  if (!resolveBy) return null;
  const at = new Date(resolveBy);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
