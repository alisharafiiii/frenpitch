"use client";

import { useState } from "react";
import type { Match, PickOutcome } from "@/app/types";
import styles from "./odds.module.css";
import ui from "@/app/styles/ui.module.css";

/** what the user tapped: market + side (+ line for totals/ah) */
export interface Selection {
  market: "1x2" | "totals" | "totals1h" | "ah";
  outcome: PickOutcome;
  line?: number;
}

const RING_COLORS = [
  "#6c5ce7",
  "#e17055",
  "#0984e3",
  "#fdcb6e",
  "#00b894",
  "#fd79a8",
];

function ringFor(code: string): string {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return RING_COLORS[h % RING_COLORS.length];
}

/** 3d glass globe flag — deep curve, saturated core, purple rim light.
 *  emoji fallback if no iso / load error. */
function FlagBadge({ iso, emoji }: { iso?: string; emoji: string; ring?: string }) {
  return (
    <span className={styles.badge}>
      {iso ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@gh-pages/flags/${iso}.svg`}
            alt=""
            width={34}
            height={34}
            className={styles.flagImg}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = "none";
              if (img.parentElement) img.parentElement.textContent = emoji;
            }}
          />
          <span className={styles.globeShine} aria-hidden />
        </>
      ) : (
        emoji
      )}
    </span>
  );
}

/* ---- svg icons (no emoji) ---- */

function IconClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tma-fg-dim)" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tma-success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--tma-warning)" stroke="none">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

/** a market section: small header + aligned two-column price grid */
function MarketSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.mkSection}>
      <div className={styles.mkHead}>{title}</div>
      <div className={styles.mkGrid}>{children}</div>
    </div>
  );
}

function MarketBtn({
  side,
  odds,
  onClick,
}: {
  side: string;
  odds: number;
  onClick: () => void;
}) {
  return (
    <button className={styles.mkBtn} onClick={onClick}>
      <span className={styles.mkSide}>{side}</span>
      <span className={`${styles.mkOdds} ${ui.num}`}>{odds.toFixed(2)}</span>
    </button>
  );
}

export function OddsCard({
  match,
  onPick,
  index = 0,
}: {
  match: Match;
  onPick: (m: Match, sel: Selection) => void;
  index?: number;
}) {
  const outcomes: { key: "home" | "draw" | "away"; label: string }[] = [
    { key: "home", label: match.home },
    { key: "draw", label: "DRAW" },
    { key: "away", label: match.away },
  ];
  const [expanded, setExpanded] = useState(false);
  const isLive = match.status === "live" || match.status === "ht";
  const hasOdds = match.odds.home > 0;
  const showMeter = isLive && match.probs;
  const hasTotals = !!match.totals && match.totals.over > 1;
  const hasTotals1h = !!match.totals1h && match.totals1h.over > 1;
  const hasAh = !!match.ah && match.ah.length > 0;
  const hasMore = hasTotals || hasTotals1h || hasAh;

  return (
    <div
      className={`${styles.card} ${showMeter || hasMore ? styles.cardWithMeter : ""}`}
      style={{ animationDelay: `${index * 0.055}s` }}
      onClick={() => hasMore && setExpanded(!expanded)}
    >
      {/* teams */}
      <div className={styles.teams}>
        <div className={styles.team}>
          <FlagBadge iso={match.homeIso} emoji={match.homeFlag} ring={ringFor(match.home)} />
          <span className={styles.code}>{match.home}</span>
        </div>
        <span className={`${styles.vs} ${ui.num}`}>
          {isLive || match.status === "ft"
            ? `${match.scoreHome}–${match.scoreAway}`
            : "vs"}
        </span>
        <div className={styles.team}>
          <FlagBadge iso={match.awayIso} emoji={match.awayFlag} ring={ringFor(match.away)} />
          <span className={styles.code}>{match.away}</span>
        </div>
      </div>

      {/* odds boxes */}
      <div className={styles.oddsRow}>
        {outcomes.map((o) => {
          const value = match.odds[o.key];
          const delta = match.oddsDelta[o.key];
          const empty = value === 0;
          return (
            <button
              key={o.key}
              className={styles.oddsBox}
              disabled={empty}
              onClick={(ev) => {
                ev.stopPropagation();
                onPick(match, { market: "1x2", outcome: o.key });
              }}
            >
              <span className={styles.oddsLabel}>{o.label}</span>
              <span className={`${styles.oddsValue} ${ui.num} ${empty ? styles.soon : ""}`}>
                {empty ? "soon" : value.toFixed(2)}
                {!empty && delta !== undefined && delta !== 0 && (
                  <span className={delta > 0 ? styles.arrowUp : styles.arrowDown}>
                    {delta > 0 ? "↑" : "↓"}
                  </span>
                )}
              </span>
              {empty && <span className={styles.dash}>–</span>}
            </button>
          );
        })}
      </div>

      {/* right rail: time / live */}
      <div className={styles.rail}>
        {isLive ? (
          <>
            <span className={styles.liveChip}>
              <span className={ui.liveDot} />
              {match.status === "ht" ? "HT" : `${match.minute}'`}
            </span>
            <span className={styles.railIcon}>
              <IconBolt />
            </span>
          </>
        ) : match.status === "ft" ? (
          <span className={styles.timeChip}>FT</span>
        ) : (
          <>
            <span className={styles.timeChip}>
              {new Date().toISOString().slice(0, 10) === match.kickoffUtc.slice(0, 10)
                ? `${match.kickoffUtc.slice(11, 16)} UTC`
                : `${new Date(match.kickoffUtc)
                    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
                    .toLowerCase()} · ${match.kickoffUtc.slice(11, 16)}`}
            </span>
            <span className={styles.railIcon}>{hasOdds ? <IconTrend /> : <IconClock />}</span>
          </>
        )}
      </div>

      {/* tap the card → every market txline prices for this fixture */}
      {hasMore && (
        <div className={styles.moreHint}>
          <span className={styles.moreChevron} style={{ transform: expanded ? "rotate(180deg)" : undefined }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
          {expanded ? "less" : "more lines"}
        </div>
      )}
      {expanded && (
        <div className={styles.marketsPanel} onClick={(ev) => ev.stopPropagation()}>
          {hasTotals && match.totals && (
            <MarketSection title="total goals">
              <MarketBtn
                side={`over ${match.totals.line}`}
                odds={match.totals.over}
                onClick={() => onPick(match, { market: "totals", outcome: "over", line: match.totals!.line })}
              />
              <MarketBtn
                side={`under ${match.totals.line}`}
                odds={match.totals.under}
                onClick={() => onPick(match, { market: "totals", outcome: "under", line: match.totals!.line })}
              />
            </MarketSection>
          )}
          {hasTotals1h && match.totals1h && (
            <MarketSection title="1st half goals">
              <MarketBtn
                side={`over ${match.totals1h.line}`}
                odds={match.totals1h.over}
                onClick={() => onPick(match, { market: "totals1h", outcome: "over", line: match.totals1h!.line })}
              />
              <MarketBtn
                side={`under ${match.totals1h.line}`}
                odds={match.totals1h.under}
                onClick={() => onPick(match, { market: "totals1h", outcome: "under", line: match.totals1h!.line })}
              />
            </MarketSection>
          )}
          {hasAh && (
            <MarketSection title="handicap">
              {match.ah!.map((l) => (
                <div key={l.line} className={styles.mkPair}>
                  <MarketBtn
                    side={`${match.home.toLowerCase()} ${l.line > 0 ? "+" : ""}${l.line}`}
                    odds={l.home}
                    onClick={() => onPick(match, { market: "ah", outcome: "home", line: l.line })}
                  />
                  <MarketBtn
                    side={`${match.away.toLowerCase()} ${l.line === 0 ? "0" : l.line > 0 ? `-${l.line}` : `+${Math.abs(l.line)}`}`}
                    odds={l.away}
                    onClick={() => onPick(match, { market: "ah", outcome: "away", line: l.line })}
                  />
                </div>
              ))}
            </MarketSection>
          )}
        </div>
      )}

      {/* live win probability meter — market-implied, updates with the stream */}
      {showMeter && match.probs && (
        <div className={styles.meterRow}>
          <span className={styles.meterPct} style={{ color: "#34d399" }}>
            {match.probs.home}%
          </span>
          <div className={styles.meterTrack}>
            <div
              className={styles.meterSeg}
              style={{ width: `${match.probs.home}%`, background: "#34d399" }}
            />
            <div
              className={styles.meterSeg}
              style={{ width: `${match.probs.draw}%`, background: "rgba(255,255,255,0.22)" }}
            />
            <div
              className={styles.meterSeg}
              style={{ width: `${match.probs.away}%`, background: "#8b7ff5" }}
            />
          </div>
          <span className={styles.meterPct} style={{ color: "#8b7ff5" }}>
            {match.probs.away}%
          </span>
        </div>
      )}
    </div>
  );
}
