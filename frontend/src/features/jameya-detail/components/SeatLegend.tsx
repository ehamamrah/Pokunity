const ITEMS = [
  { label: 'Available', hint: 'You can select it' },
  { label: 'On hold', hint: 'Another member is holding it' },
  { label: 'Taken', hint: 'Confirmed by a member' },
  { label: 'Restricted', hint: 'Not open to your account' },
  { label: 'Your hold', hint: 'Yours, and waiting on payment' },
] as const;

export function SeatLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Seat legend">
      {ITEMS.map((item) => (
        <li key={item.label}>
          <span className="font-semibold text-slate-800">{item.label}</span>: {item.hint}
        </li>
      ))}
    </ul>
  );
}
