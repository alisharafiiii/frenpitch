import fs from "node:fs";
import path from "node:path";

/** append-only jsonl recorder — every raw upstream payload gets saved.
 *  recordings are the fuel for replay mode (demo video + post-tournament
 *  judging). works on local dev / railway; on vercel's read-only fs it
 *  fails silently (record locally during matches, ship the jsonl files). */

const DIR = path.join(process.cwd(), "recordings");

export function record(source: "odds" | "scores", raw: unknown): void {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const file = path.join(DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), source, raw }) + "\n");
  } catch {
    // read-only fs (vercel) — skip silently
  }
}
