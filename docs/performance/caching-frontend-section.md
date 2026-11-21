<!-- Section for docs/performance/caching.md, "## Frontend". Created because the shared file did not exist yet. -->

## Frontend

The browser is the first cache. The frontend is built so that it uses the browser's HTTP cache for
reads, revalidates with the contract's ETags, and keeps the freshness indicator truthful even when
nothing in the body changed.

### What the browser does

| Read | Response from the BFF | What happens |
|---|---|---|
| Marketplace list, featured, similar | `Cache-Control: private, max-age=5`, `ETag`, `X-As-Of` | Fresh for 5 s from the browser cache. After that the browser sends `If-None-Match`; an unchanged result comes back as `304`, and the browser serves its stored body. |
| Jameya detail (seat map) | `Cache-Control: private, no-cache`, `ETag`, `X-As-Of` | Revalidated on every use. A `304` is served from the browser cache without downloading the seat map again. |
| `/me` | `Cache-Control: private, no-cache`, `ETag` | Revalidated on use; unchanged profiles cost one small round trip with no body. |
| Reservations, checkout status | No ETag caching (authoritative) | Always fetched. |

The application requests reads with the default fetch cache mode and writes with `no-store`. Nothing
in application code sends `If-None-Match` by hand: the browser does, because the response carries an
`ETag`. A `304` therefore never reaches JavaScript as a `304`. The browser merges the headers from the
`304` into its stored response, and the page sees a normal `200`.

### Freshness: `X-As-Of`

The "Availability updated Xs ago" line reads the `X-As-Of` header, which the server sends on `200` and
`304` alike. A revalidated response with unchanged content therefore still moves the timestamp
forward, and the line keeps counting from the last time the server checked. The body's `asOf` is the
fallback for responses without the header.

### Structural sharing: no re-render for unchanged data

When a refetch returns the same content, TanStack Query keeps the existing object references, so
unchanged Jameyas are not re-rendered. The only object that changes is the list envelope (its
`asOf`). Each card is memoized, so a refetch re-renders only the cards whose data changed. Tests lock
this in (`structural-sharing.test.ts`): unchanged items keep their reference, and a changed item is
the only one replaced.

### Server prefetch

The first page of Jameyas, the featured list, the profile and the detail are fetched on the server
and hydrated into the client cache with the same query keys and functions. Hydrated data carries its
original `dataUpdatedAt`, so the client does not refetch on mount while the data is within its
`staleTime`. The first paint therefore has data, and revalidation works from the first navigation.

### What the user sees

- **Unchanged data:** no flicker, no re-render, and a freshness line that keeps counting correctly.
- **Changed data:** the changed card updates; the others stay as they were.
- **Session ended on another device:** the next request returns `401`. The app clears its cache,
  and the user lands on sign-in with a "session ended" notice and a return path (`next`).
- **Log out of all devices:** every token is revoked, and the browser's HTTP cache is cleared
  (`Clear-Site-Data: "cache"`), so the next member on this browser cannot see the previous member's
  responses.
