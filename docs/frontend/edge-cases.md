# Frontend Edge Cases

What the member sees when something goes wrong. Backend cases: [reservation edge cases](../reservation/edge-cases.md).

## Booking

| Case | What the member sees |
|---|---|
| Double click on Hold or Pay | Button disables; a repeat reuses the same `Idempotency-Key`, so only one request takes effect |
| Seat just taken (`SEAT_UNAVAILABLE`) | "Holding…" rolls back, the map refreshes, and the nearest free seats are suggested |
| Jameya full (`JAMEYA_FULL`) | Similar Jameyas shown inline, or "Nothing similar is open right now" |
| Already holding a seat here | Link to the existing hold |
| Hold limit reached | The real limit, with a link to My reservations |
| Restricted seat (risk, KYC) | Greyed out, the reason in text and in the screen-reader label |
| KYC pending, rejected or unavailable | Banner explains; browsing always works |
| Stale seat map | Refreshes every 5 s and on focus; the server catches conflicts with `409` |

## Checkout

| Case | What the member sees |
|---|---|
| Hold expires on screen | Countdown hits zero, Pay disables, "choose the seat again" |
| Hold expired on the server | Seen within 5 s by polling; same message |
| Paid in another tab (`INVALID_STATE`) | Reservation re-read; the real status is shown |
| Slow payment (`tok_slow`) | "Confirming your payment… result by HH:MM at the latest" |
| No callback (`tok_timeout`) | Keeps confirming until reconciliation settles it; never implies a charge |
| Declined | "Your card was not charged." Seat can be chosen again |
| Duplicate callbacks | No visible effect; the UI shows only the server's status |
| Zero-fee seat | "Confirm seat (no fee)", no payment picker |
| Page closed while paying | On return, the server's status is shown |
| Back button during checkout | Reloads the live status, not a stale copy |

## Network and backend

| Case | What the member sees |
|---|---|
| Network drop on a write | Retried twice with the same key; still "Holding…" meanwhile |
| Network drop on a read | Retried twice; data on screen stays |
| Rate limited (`429`) | Waits for `Retry-After`; further writes are held locally until then |
| Backend slow (`504`) or down (`503`) | Named error and Retry; writes say "No charge was made" |
| Backend failing repeatedly | BFF circuit opens and answers `503` at once, then one probe tests recovery |
| Server render can't prefetch | Page renders and fetches in the browser instead |
| Response doesn't match the contract | Contained error in that section, never corrupt data |

## Session

| Case | What the member sees |
|---|---|
| Session expired or revoked elsewhere | Cookie cleared; sign-in page, then back to the same page |
| Log out of all devices | This device signs out; other devices on their next request |
| Logout while the backend is down | Signed out locally anyway; the failure is logged without the token |
| Analytics queued at logout | Queue dropped, so no event crosses sessions |
| `?next=` pointing off-site | Ignored; goes to `/` |

## Marketplace

| Case | What the member sees |
|---|---|
| Content unchanged (`304`) | No re-render; "updated Xs ago" still moves |
| Fast typing in search | One request per 300 ms pause; under 2 characters is not sent |
| Min amount above max | Apply disabled, with an explanation |
| Shared or bookmarked filter URL | Same results; invalid values fall back to defaults |
| Unknown id or malformed URL | Not-found page with a link back |
| Long reservation history | 20 per page, page number in the URL |
| Analytics endpoint failing | Events re-queued (max 200), dropped after 3 failures; UI never blocked |
