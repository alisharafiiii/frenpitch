# frenpitch — technical documentation

**txodds world cup hackathon · consumer and fan experiences track**
live app: [t.me/frenpitch_bot/app](https://t.me/frenpitch_bot/app) · web: [frenpitch.vercel.app](https://frenpitch.vercel.app) · repo: [github.com/alisharafiiii/frenpitch](https://github.com/alisharafiiii/frenpitch)

## what it is

frenpitch is a telegram mini app where frens watch the world cup together in a
virtual stadium. everyone's pfp stands on the pitch; tapping a fren shows their
live bet and pnl. you bet matchday points against real txline consensus odds
(1x2, over/under, 1st-half totals, asian handicap), run private tournaments
with onchain usdc prize pools on solana, play synced multiplayer quizzes at
halftime — and a physical stackchan droid on your desk calls the match:
goal strobes, card sequences, line moves, spoken announcements.

the differentiator is the fren layer: betting alone is a spreadsheet,
betting in a stadium full of your people is a sport.

## architecture

```
┌─ telegram mini app (next.js 14, app router, css modules) ──────────┐
│ home: odds cards + expandable markets + pick slip                  │
│ stadium: frens on the pitch (formation layout), live pnl, sweat    │
│ tours: create/join/fund tournaments, leaderboards, onchain pool    │
│ quiz: synced multiplayer lobbies, platform-served questions        │
│ me: bankroll/pnl, pick history, droid pairing, achievements        │
│ /admin: stats control room (users, activity, force-result)         │
└──────────────┬─────────────────────────────────────────────────────┘
               │ x-init-data (telegram initData, HMAC-verified)
┌──────────────▼──── vercel (serverless) ────────────────────────────┐
│ /api/fixtures   snapshots + stream-fed price memory fallback       │
│ /api/feed       SSE: odds+scores streams → normalize → fan out     │
│                 ?user= → droid mode (server-side match filter)     │
│ /api/picks      bet placement, bankroll enforcement                │
│ /api/me         login + opportunistic settlement (redis lock)      │
│ /api/settle     settlement engine + admin force-result             │
│ /api/tournaments create/join/fund/settle, passcode gates           │
│ /api/quiz       lobby lifecycle, seed-synced questions             │
│ /api/droid/*    follow-a-match, elevenlabs tts (pcm 16k)           │
│ /api/warm       cron-pinged stream listener (github actions, 5min) │
└───┬───────────────┬─────────────────────────┬──────────────────────┘
    │               │                         │
 upstash redis   txline api               solana devnet
 (users, picks,  (fixtures/odds/scores    (custodial wallets,
  tours, quiz,    snapshots + SSE          per-tour escrow vaults,
  price memory)   streams, guest JWT)      spl payouts + explorer)
                                          [anchor escrow program in
                                           repo as trustless roadmap]
    │
┌───▼──── stackchan droid (m5stack cores3, platformio) ──────────────┐
│ m5stack-avatar face (6 moods) + match-event takeover frames        │
│ SSE client → /api/feed?user=<tg id> (server filters to followed    │
│ match, set from the app — retarget without reflash)                │
│ scoreboard info panel · goal/card/odds sequences · feetech servo   │
│ gestures · elevenlabs voice via server (key never on device)       │
└────────────────────────────────────────────────────────────────────┘
```

## txline integration (the core input)

- **auth**: guest jwt (`POST /auth/guest/start`, cached ~20 min) + `X-Api-Token`.
  the api key was activated on-chain — solana mainnet `subscribe` on the
  txoracle program (ata creation as pre-instruction was required).
- **markets consumed**: 1x2 (`1X2_PARTICIPANT_RESULT`), over/under goals
  (`OVERUNDER_PARTICIPANT_GOALS`, full match + `half=1`), asian handicap
  (`ASIANHANDICAP_PARTICIPANT_GOALS`). prices arrive in thousandths
  (4929 → 4.929); `Pct` provides demargined win probabilities — surfaced
  directly as the live win-prob meter and the droid's bar.
- **clean-line policy**: quarter lines (±0.25/±0.75) are excluded by design —
  half-win/half-push semantics would double the settlement surface and
  confuse casual players. totals: .5 lines never push, whole lines push
  (stake refund). handicap: 0 = draw-no-bet, ±0.5 never pushes.
- **stream-fed price memory**: we observed snapshots intermittently returning
  empty while the SSE stream kept pricing (details in the api feedback doc).
  every price seen on the stream is remembered in redis (12h ttl);
  `/api/fixtures` falls back to memory when snapshots gap. a github actions
  cron pings `/api/warm` every 5 minutes so the memory stays hot even when
  nobody has the app open.
- **event normalization**: one `MatchEvent` shape feeds every client — the
  mini app, the settlement engine, and the droid. raw payloads are also
  recorded untouched (jsonl) for replay mode and post-hoc verification.

## settlement engine

runs opportunistically whenever anyone opens the app (awaited, throttled by a
90s redis lock) plus a manual trigger. verified against real finished matches:

- **finished** = `Action: game_finalised` (observed `StatusId 100`) or
  status 5/10/13 (F/FET/FPE per spec)
- **final score** = flat `Stats["1"]/["2"]` on the latest entry
- **half-time score** = the `halftime_finalised` entry (StatusId 3) carries
  the 1H score in flat stats — grades 1st-half totals
- **grading**: 1x2 on outcome; totals on total goals vs line with push;
  handicap on goal difference + line with push on level
- winners get stake × locked odds; pnl, streaks and win records update;
  pushes refund silently
- admin force-result exists as a demo-day safety valve (same payout path,
  1x2 only — totals always wait for real data)

production lesson worth sharing: settlement was originally fire-and-forget on
login, which silently never ran on serverless (the lambda freezes at response
time). it's awaited now — the lock keeps it cheap.

## the fren layer

- **stadium**: recent frens take the pitch in a 1-4-3-3 formation (max 11),
  the rest fill the sideline; each avatar carries live pick + pnl. built on
  the same lobby patterns as our previous tg mini app (minted mind).
- **tournaments**: invite via `t.me/frenpitch_bot/app?startapp=<code>`,
  optional passcode, configurable buy-in/size/prize split. funding mints and
  transfers usdc (mock mint) into a per-tournament vault on solana devnet —
  real transactions, explorer links in the ui. payouts split by rule
  (winner-take-all / 70-20-10 / even top 3). a trustless anchor escrow
  program (pda vaults, permissionless refund after deadline) is in the repo
  as the mainnet path.
- **quiz**: multiplayer lobbies with host-start, seed-synced question order
  (everyone sees the same question at the same time — no cheating by
  peeking), server-side scoring, daily challenge.

## the droid (physical fan experience)

m5stack cores3 stackchan, platformio firmware in `droid/firmware`:

- **face**: stock m5stack-avatar (auto-blink, breathing) with moods mapped to
  match moments — happy on goals, angry on red cards, doubt on var, sleepy at
  halftime
- **event takeovers**: goal strobe → celebration + servo dance → score ticker;
  yellow/red card sequences; odds line-move flashes
- **info panel**: broadcast-style scoreboard (styled country flags, score,
  segmented win-prob bar, odds with move-direction arrows, live minute)
  rotating with the face
- **voice**: elevenlabs tts proxied through the server as raw 16khz pcm —
  the api key never touches the device; phrases cached, daily budget capped
- **follow-a-match**: the feed endpoint filters server-side per user
  (pinned match or auto = latest open pick, set from the me tab) — the droid
  retargets live without reflashing
- **demo mode**: hold the screen at boot → scripted match loop for filming
  and judging without depending on a live fixture

hardware bring-up (servo power rails, i2c quirks, display safety) is inherited
from our previous cores3 project and documented in the firmware source.

## security and fairness

- telegram `initData` HMAC-verified server-side on every request; identity
  is never client-claimed
- all external keys (txline, elevenlabs, solana escrow keypair) live in
  server env only
- odds locked at confirm time; settlement only from feed data (or explicit,
  logged admin override); points economy is closed — only tournament buy-ins
  touch the chain (devnet)

## known limitations / roadmap

- custodial devnet wallets and mock usdc — the anchor escrow program +
  oracle-signed results are the trustless upgrade path
- one bookmaker source on the free tier (demargined consensus) — with more
  sources, the "hot odds" movers get richer
- quiz bank is intentionally small for the demo
