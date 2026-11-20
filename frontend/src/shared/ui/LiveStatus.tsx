/** Visually hidden live region for announcing status transitions to screen readers. */
export function LiveStatus({ message }: { message: string | null }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message ?? ''}
    </p>
  );
}
