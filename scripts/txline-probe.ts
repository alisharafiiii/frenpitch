/**
 * probe — look at real txline payloads so we can tune the normalizer.
 *
 *   npm run probe
 *
 * prints: 3 raw fixtures, then listens to the odds + scores streams for
 * 60s and prints the first few messages of each. everything is also saved
 * to recordings/probe-samples.json — paste that file into the chat and
 * the field mappings get locked in.
 */

import fs from "node:fs";
import path from "node:path";

const API = "https://txline.txodds.com";

function loadToken(): string {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(/^TXLINE_API_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  }
  if (process.env.TXLINE_API_TOKEN) return process.env.TXLINE_API_TOKEN;
  console.error("no TXLINE_API_TOKEN — run `npm run get-key` first");
  process.exit(1);
}

async function main() {
  const apiToken = loadToken();
  const jwtRes = await fetch(`${API}/auth/guest/start`, { method: "POST" });
  const { token: jwt } = (await jwtRes.json()) as { token: string };
  const headers = { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken };

  const samples: Record<string, unknown> = {};

  // 1. fixtures
  console.log("— fixtures snapshot —");
  const fx = await fetch(`${API}/api/fixtures/snapshot`, { headers });
  console.log("status:", fx.status);
  const fixtures = (await fx.json()) as unknown[];
  console.log("count:", Array.isArray(fixtures) ? fixtures.length : "not an array");
  console.log(JSON.stringify(fixtures.slice(0, 3), null, 2));
  samples.fixtures = fixtures.slice(0, 5);

  // 2. streams — listen 60s, print first 5 of each
  for (const kind of ["odds", "scores"] as const) {
    console.log(`\n— ${kind} stream (60s listen) —`);
    const collected: unknown[] = [];
    try {
      const res = await fetch(`${API}/api/${kind}/stream`, {
        headers: { ...headers, Accept: "text/event-stream" },
        signal: AbortSignal.timeout(60_000),
      });
      console.log("status:", res.status);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (collected.length < 5) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split(/\r?\n\r?\n/);
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const dataLine = block
            .split(/\r?\n/)
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (!dataLine) continue;
          let parsed: unknown = dataLine;
          try {
            parsed = JSON.parse(dataLine);
          } catch { /* keep string */ }
          collected.push(parsed);
          console.log(JSON.stringify(parsed).slice(0, 500));
          if (collected.length >= 5) break;
        }
      }
      reader.cancel().catch(() => {});
    } catch (err) {
      console.log(`(${kind}: no messages in 60s or stream closed — normal if no live match right now)`);
    }
    samples[kind] = collected;
  }

  fs.mkdirSync(path.join(process.cwd(), "recordings"), { recursive: true });
  const out = path.join(process.cwd(), "recordings", "probe-samples.json");
  fs.writeFileSync(out, JSON.stringify(samples, null, 2));
  console.log(`\n💾 saved samples to recordings/probe-samples.json`);
}

main().catch((e) => {
  console.error("probe failed:", e?.message ?? e);
  process.exit(1);
});
