# frenpitch ⚽

frens live in a stadium. solo picks vs txline consensus odds, fren tournaments with
onchain usdc prize pools, halftime lobby quizzes — and a stackchan droid calling the
match from your desk.

built for the **txodds world cup hackathon — consumer and fan experiences track**
($16k · closes july 19, 2026 23:59 utc).

## run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit (passing)
npm run build      # production build (passing)
```

runs in any browser (mock tg user fallback); inside telegram it picks up the real
webapp identity automatically.

## what's here

| path                          | what                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `app/`                        | next.js app router · css modules · tma design tokens          |
| `app/page.tsx`                | home — hot odds, live deltas, pick slip, my picks             |
| `app/stadium/`                | the hero screen — frens on the pitch, pnl tags, sweat sheet   |
| `app/tournaments/new/`        | buy-in, escrow pool, prize split, contact invites             |
| `app/quiz/`                   | multiplayer lobby quiz, platform-served questions             |
| `app/me/`                     | tg profile, droid pairing, embedded wallet                    |
| `app/lib/events.ts`           | event bus + **ReplayEngine** (record real streams, replay 10x)|
| `app/lib/txline.ts`           | feed client — replay mode wired, live mode swap point         |
| `programs/escrow/src/lib.rs`  | anchor escrow: create / join / settle / refund                |
| `docs/droid-spec.md`          | stackchan event schema + face states + pairing                |

## architecture in one line

**one normalized `MatchEvent` stream** → mini app ui, pnl engine, settlement oracle,
and the droid all subscribe to the same bus. record real txline payloads during live
games → replay them for judges after the tournament ends.

## the 12 days

- **d1–2** — txline live integration + stream recorder (sign up through solana, api key)
- **d3–5** — picks engine on real odds · settlement worker · tg bot + auth validation
- **d6–8** — escrow program on devnet (mock usdc mint) · invite links + passcodes
- **d9–10** — droid firmware (face states + tts) · polish · replay mode hardening
- **d11–12** — **demo video is the product**: droid + stadium reacting to the same goal, live app walkthrough, monetization slide (3–5% tournament rake, premium sweat analytics, bigger lobbies)

## submission checklist (from the listing)

- [ ] demo video ≤ 5 min (loom/yt) — problem, live walkthrough, how txline powers it
- [ ] deployed link (vercel) + public repo
- [ ] brief tech doc — core idea, highlights, txline endpoints used
- [ ] txline api feedback (keep notes as you build — it's a scored requirement)
- [ ] uses txline as live input ✓ (replay engine keeps it demoable post-tournament)
- [ ] functional product, not mockups ✓

## honest scope notes

- points are off-chain, only tournament money touches solana — speed where it matters,
  chain where it counts
- settlement is oracle-signed by our backend from txline events; the refund instruction
  is permissionless after deadline + 48h, so worst case the contract hands everyone
  their money back
- droid is a demo-layer companion — the app fully works without it
- participants are responsible for legal compliance per hackathon rules (skill-contest
  framing, virtual bankroll for picks, real usdc only in fren escrow)
