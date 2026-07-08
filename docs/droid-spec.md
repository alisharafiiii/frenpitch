# stackchan droid — matchday pundit spec

the droid is **just another client** of the same event stream the mini app consumes.
zero new backend logic: esp32 connects over websocket (or mqtt), receives normalized
`DroidEvent` json, renders it physically — face, servos, tts.

app must fully work without the droid. droid features get cut first if time runs out.
never the app.

## pairing flow

1. droid boots → shows qr with `wss://api.frenpitch.app/droid?code=XXXX`
2. user opens **me → pair droid** in the mini app, scans qr
3. app POSTs `{ code, userId }` → backend binds droid socket to that user
4. droid now receives that user's event stream: their matches, their frens, their quizzes

## event schema (over the wire)

same `MatchEvent` / `SocialEvent` types as the app (`app/types/index.ts`):

```json
{ "kind": "match", "event": {
  "id": "e5", "matchId": "m1", "t": 26000, "type": "goal",
  "team": "home", "player": "estevão", "minute": 67,
  "scoreHome": 2, "scoreAway": 1
}}
```

```json
{ "kind": "social", "event": {
  "id": "s2", "t": 31000, "type": "fren_pick_locked",
  "frenHandle": "dex", "detail": "dex locked 100 on france ML @ 3.85"
}}
```

## face states (custom football ui on the m5 display)

| state       | trigger                                | face + screen                                        | servos / tts                              |
| ----------- | -------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `idle`      | default                                | scanning eyes, mini scoreboard ticker, kit colors    | slow head sway                            |
| `goal`      | `goal` (your team / your pick's team)  | full celebration, confetti, score flash              | dance + "GOOOAL {team}, {minute}th!"      |
| `goal_against` | `goal` against your pick            | wide-eyed shock, score flash in red                  | slump + "oh no. oh no no no."             |
| `sweat`     | `odds_move` against your live pick     | worried eyes + odds line drifting on forehead        | fidget + "france drifting… stay calm"     |
| `var`       | `var_check`                            | squinting "checking…" face, spinner ring             | head tilt, silence (dramatic)             |
| `card_red`  | `card_red`                             | shocked face, red flash                              | "RED CARD. {player} is OFF."              |
| `pundit`    | `odds_move` (big delta, any direction) | eyebrows + odds ticker                               | "market says {outcome} now {odds}"        |
| `fren`      | `social: fren_pick_locked`             | smirk + fren handle on screen                        | "{fren} just locked {detail}… bold"       |
| `quizmaster`| `social: quiz_started` / question feed | question countdown ring around face                  | reads question aloud, reacts to scores    |

priority when events overlap: `goal* > card_red > var > sweat > pundit > fren > idle`.
tts queue max 2 deep — drop stale lines, never lag the match.

## firmware notes (m5stack / esp32)

- m5unified + lvgl for the face; one `FaceState` enum mirrors the table above
- wifi → wss with exponential backoff reconnect; buffer last event for replay on reconnect
- tts: cloud api (fastest to ship) — stream mp3 to speaker; cache common lines ("goal!")
- kit colors set at pair time from the user's favorite team in their profile
- replay mode works on the droid too — same recorded stream, perfect for the demo video

## demo video beat (the 5 seconds judges remember)

phone showing the stadium lobby + droid on the desk next to it. goal hits the stream:
stadium ripples green on screen **and** the droid erupts in the same instant.
one event, two worlds. cut to title card.
