import { NextResponse } from "next/server";
import { identityFromRequest } from "@/app/lib/server/auth";
import { getAllUsers, getUserPicks, redis } from "@/app/lib/server/db";

export const dynamic = "force-dynamic";

/** GET /api/stadium — every fren in the lobby with their latest pick.
 *  positions are derived deterministically from the user id so each
 *  fren always stands on their own spot on the pitch. */

function posFor(id: string): { x: number; y: number } {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const x = 22 + (h % 57); // 22..78 %
  const y = 16 + ((h >>> 8) % 66); // 16..81 % (unsigned shift — no negatives)
  return { x, y };
}

export const revalidate = 0;

export async function GET(req: Request) {
  try {
    // being in the stadium counts as being online — heartbeat the caller
    const who = identityFromRequest(req);
    if (who.id !== "demo") {
      await redis()
        .hset(`user:${who.id}`, { lastSeen: Date.now() })
        .catch(() => {});
    }
    return await buildStadium();
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("stadium failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function buildStadium() {
  const users = (await getAllUsers()).filter((u) => u.id !== "demo");
  const frens = await Promise.all(
    users.map(async (u) => {
      const picks = await getUserPicks(u.id, 3);
      const live = picks.find((p) => p.status === "open");
      const last = picks[0];
      return {
        id: u.id,
        handle: u.username,
        initial: (u.name[0] ?? "?").toUpperCase(),
        photoUrl: `/api/avatar/${u.id}`,
        hasPhoto: Boolean(u.photoUrl), // tg delivered a real profile photo
        pnl: u.pnl,
        streak: u.streak,
        online: Date.now() - u.lastSeen < 10 * 60 * 1000,
        lastSeen: u.lastSeen,
        ...posFor(u.id),
        livePick: live ?? null,
        lastPick: last ?? null,
      };
    })
  );
  return NextResponse.json({ frens });
}
