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

export function IconTrophy() {
  return (
    <svg {...base}>
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
