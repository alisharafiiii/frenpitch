# txline api — field feedback from building frenpitch

everything below was observed while running a live product on the api for a
week of the tournament (2026-07-08 → 07-15), with a real community placing
140+ picks. raw upstream payloads were recorded throughout, so every finding
is reproducible. dates are utc.

## what worked well

- **guest jwt flow** is refreshingly simple — `POST /auth/guest/start`,
  cache ~20 min, done. no oauth ceremony.
- **demargined `Pct`** is a genuinely differentiating field. we surfaced it
  raw as a live win-probability meter in the app and on the droid's
  scoreboard — zero math on our side, and it's a data point users don't get
  from normal bookmaker feeds.
- **prices in thousandths** are unambiguous and float-safe once you know
  (4929 → 4.929).
- **SSE streams** are plain and easy to consume from any client — including
  an esp32 microcontroller. `id:` lines are present, which would make resume
  possible (see wishlist).
- **the on-chain key activation** (solana `subscribe` on the txoracle
  program) is a cool primitive — access as a token, verifiable on-chain.

## findings

### 1. odds snapshots intermittently return empty while the stream keeps pricing

**observed 2026-07-15.** `GET /api/odds/snapshot/18241006` (eng–arg) returned
11 market entries at ~15:30 utc; ~30 minutes later, `[]`. by ~17:00 every
fixture's odds snapshot returned `[]` — while `GET /api/odds/stream` in the
same window delivered 49 price events in 40 seconds (1x2 + totals +
handicap). the two channels disagree about whether prices exist at all.

impact: any client that builds its ui from snapshots goes blank. we had to
build a stream-fed price cache (redis) with snapshot fallback + a cron that
listens to the stream every 5 minutes just to keep prices on screen.

suggestion: snapshot parity with the stream (snapshot = last streamed value),
or document snapshot ttl/suspension semantics so integrators expect it.

### 2. markets appear in one channel but not the other, per fixture

**observed 2026-07-15.** fra–eng (18257865): over/under updates streamed
heavily (majority of a 40s stream sample) but its odds snapshot contained
**zero** overunder entries — 1x2 only. meanwhile spa–arg (18257739) had
overunder in the snapshot but only `MarketPeriod: "half=1"` lines — its
full-match line (line=2) had streamed earlier and then vanished from the
snapshot entirely.

impact: "which markets exist for this match" has no single source of truth.

### 3. fixtures snapshot drops matches at kickoff

eng–arg was listed in `/api/fixtures/snapshot` pre-match and disappeared from
it around kickoff while still being live (scores kept streaming). if
intentional (snapshot = upcoming only), worth documenting — a `status` field
on fixtures would remove the guesswork.

### 4. `GameState` is always null — real finish signals live elsewhere

across every scores payload we recorded, `GameState` was null. actual match
state had to be derived from `Action` strings + `StatusId`:

- finished: `Action: "game_finalised"` with `StatusId: 100` (observed live) —
  note the spec lists phases 1–19, and 100 isn't in it
- also seen as terminal: status 5 / 10 / 13 (F / FET / FPE)
- halftime: `Action: "halftime_finalised"`, `StatusId: 3`

suggestion: either populate `GameState` or document the `Action` vocabulary —
we counted values like `game_finalised`, `halftime_finalised`, `var`,
`throw_in`, `yellow_card`, etc., all discovered empirically.

### 5. the `Stats` map encoding is undocumented

flat keys `"1"`/`"2"` are participant goals (this we could verify). the
half-time score is retrievable from the `halftime_finalised` entry's flat
stats — that's what our 1st-half totals settlement uses, verified against
fra–esp (ht 0–1, ft 0–2). but the block keys (`1001`…`7008`) don't follow an
obvious period×participant scheme — e.g. values in the `2xxx`/`3xxx` blocks
were already non-zero at halftime and unchanged by second-half goals. a key
table in the docs would unlock per-period and per-stat products.

### 6. `PriceNames` vocabulary varies by market

`["part1","draw","part2"]` for 1x2, `["over","under"]` for totals,
`["part1","part2"]` for handicap. fine once known — a documented enum per
`SuperOddsType` (and of `MarketParameters` like `line=`) would save every
integrator the same discovery loop.

### 7. `MarketPeriod: null` means full match — implicitly

full-match markets carry `null`; period markets carry `"half=1"`. explicit
`"full"` (or documentation of the null convention) would prevent
misclassification — we initially treated a `half=1` 1x2 as the main market
until live prices looked wrong.

### 8. keepalives are bare `{Ts}` objects

easy to handle, but an SSE comment (`: ka`) is the conventional keepalive and
wouldn't require json-parsing every frame to discover it's empty.

### 9. on-chain activation: two sharp edges

- the program idl isn't published on-chain — we extracted it from the docs
  page to build the `subscribe` call
- `subscribe` fails with `AccountNotInitialized` unless the user token
  account exists — an `createAssociatedTokenAccountIdempotent`
  pre-instruction fixed it; the docs example doesn't mention it

## wishlist

1. snapshot ⇄ stream parity (finding 1 is the single biggest integration cost)
2. documented `Action` + `StatusId` + `Stats` vocabularies (findings 4–5)
3. fixture `status` field (upcoming/live/finished) in the fixtures snapshot
4. SSE resume via `Last-Event-ID` (ids are already emitted — honoring them on
   reconnect would make embedded clients like our droid much more robust)
5. a replay/sandbox fixture (historical match streamed on demand) — we built
   our own recorder for demos; an official one would help every hackathon team
6. webhooks for terminal events (`game_finalised`) — settlement without polling

— team frenpitch (consumer & fan experiences track)
