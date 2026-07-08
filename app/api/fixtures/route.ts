import { NextResponse } from "next/server";
import { getApiToken, txGet } from "@/app/lib/server/txline-server";
import { normalizeFixture } from "@/app/lib/server/normalize";
import type { Match } from "@/app/types";

export const dynamic = "force-dynamic";

/** GET /api/fixtures — normalized fixtures from txline.
 *  returns { live: false } if no api token so the client falls back
 *  to replay mode without breaking. */
export async function GET() {
  if (!getApiToken()) {
    return NextResponse.json({ live: false, matches: [] });
  }
  try {
    const raw = await txGet<Record<string, unknown>[]>("/api/fixtures/snapshot");
    const matches = raw
      .map(normalizeFixture)
      .filter((m): m is Match => m !== null)
      // soonest first, cap the list for the home screen
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
      .slice(0, 20);
    return NextResponse.json({ live: true, matches });
  } catch (err) {
    console.error("fixtures fetch failed:", err);
    return NextResponse.json({ live: false, matches: [] });
  }
}
