"use client";

/** thin-outline icon set (choice: fire A + nav set 1).
 *  all stroke currentColor so active/inactive tints come from css. */

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconFire({ size = 18, color = "#ff7043" }: { size?: number; color?: string }) {
  return (
    <svg {...base} width={size} height={size} stroke={color} strokeWidth={1.8}>
      <path d="M12 3c.5 3-1.5 4.5-2.5 6C8.3 10.8 8 12 8 13.5A4.4 4.4 0 0 0 12.5 18 4.6 4.6 0 0 0 17 13.3c0-1.3-.5-2.6-1.3-3.8-.4 1-1 1.6-1.7 2 .3-2.7-.6-6-2-8.5z" />
    </svg>
  );
}

export function IconBolt() {
  return (
    <svg {...base} strokeWidth={1.8}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

export function IconStadium() {
  return (
    <svg {...base} strokeWidth={1.6}>
      <ellipse cx="12" cy="12" rx="9.2" ry="6.4" />
      <ellipse cx="12" cy="12" rx="5.6" ry="3.6" />
      <path d="M12 8.4v7.2" strokeWidth={1.2} />
    </svg>
  );
}

export function IconTrophy({ size = 22, color }: { size?: number; color?: string } = {}) {
  return (
    <svg {...base} width={size} height={size} stroke={color ?? "currentColor"}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    </svg>
  );
}

export function IconBrain() {
  return (
    <svg {...base}>
      <path d="M12 4a3 3 0 0 0-3 3v0a3 3 0 0 0-2.5 4.6A3.2 3.2 0 0 0 7 17c.4 1.8 2 3 3.7 3H12M12 4a3 3 0 0 1 3 3v0a3 3 0 0 1 2.5 4.6A3.2 3.2 0 0 1 17 17c-.4 1.8-2 3-3.7 3H12M12 4v16" />
    </svg>
  );
}

export function IconUser() {
  return (
    <svg {...base}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

/* ---- tours tab minis (size/color via props) ---- */

type Mini = { size?: number; color?: string };

export function IconCoins({ size = 15, color = "currentColor" }: Mini) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

export function IconUsers({ size = 15, color = "currentColor" }: Mini) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5a3.2 3.2 0 0 1 0 6.3M21 20a6 6 0 0 0-4.5-5.8" />
    </svg>
  );
}

export function IconBag({ size = 15, color = "currentColor" }: Mini) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7c-3 3-5 5.5-5 9a8 8 0 0 0 16 0c0-3.5-2-6-5-9l1.5-3.5h-9L9 7z" />
      <path d="M9 7h6" />
      <path d="M12 12v6M10 13.5h3a1.5 1.5 0 0 1 0 3h-2" strokeWidth={1.4} />
    </svg>
  );
}

export function IconSplit({ size = 15, color = "currentColor" }: Mini) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12l6 6M12 12l-8-2.5" />
    </svg>
  );
}

export function IconQr({ size = 18, color = "currentColor" }: Mini) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h3v3M20 14v6h-6" />
    </svg>
  );
}

export function IconArrowRight({ size = 16, color = "currentColor" }: Mini) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconLock({ size = 14, color = "currentColor" }: Mini) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
