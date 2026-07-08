/** server-only txline client — the api token lives in .env.local and
 *  NEVER reaches the browser. all data flows through our api routes. */

const API_ORIGIN = "https://txline.txodds.com";

export function getApiToken(): string | null {
  return process.env.TXLINE_API_TOKEN ?? null;
}

// guest jwt — cached ~20 min, refreshed automatically
let cachedJwt: { token: string; at: number } | null = null;

export async function getJwt(): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.at < 20 * 60 * 1000) {
    return cachedJwt.token;
  }
  const res = await fetch(`${API_ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth failed: ${res.status}`);
  const data = (await res.json()) as { token: string };
  cachedJwt = { token: data.token, at: Date.now() };
  return data.token;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = getApiToken();
  if (!token) throw new Error("TXLINE_API_TOKEN missing — run `npm run get-key`");
  return {
    Authorization: `Bearer ${await getJwt()}`,
    "X-Api-Token": token,
    "Content-Type": "application/json",
  };
}

export async function txGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`txline GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function openStream(path: string): Promise<Response> {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    headers: {
      ...(await authHeaders()),
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
  if (!res.ok) throw new Error(`txline stream ${path} failed: ${res.status}`);
  return res;
}

// ---- SSE parsing (from txline docs) ----

export type SseMessage = { id?: string; event?: string; data: string; retry?: number };

function parseSseBlock(block: string): SseMessage | null {
  const message: SseMessage = { data: "" };
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const sep = rawLine.indexOf(":");
    const field = sep === -1 ? rawLine : rawLine.slice(0, sep);
    const value = sep === -1 ? "" : rawLine.slice(sep + 1).replace(/^ /, "");
    if (field === "data") message.data += `${value}\n`;
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
    if (field === "retry") message.retry = Number(value);
  }
  message.data = message.data.replace(/\n$/, "");
  return message.data || message.event || message.id ? message : null;
}

export async function* readSseMessages(response: Response): AsyncGenerator<SseMessage> {
  if (!response.body) throw new Error("stream response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.match(/\r?\n\r?\n/);
      while (sep?.index !== undefined) {
        const block = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep[0].length);
        const message = parseSseBlock(block);
        if (message) yield message;
        sep = buffer.match(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    const message = parseSseBlock(buffer);
    if (message) yield message;
  } finally {
    reader.releaseLock();
  }
}

export function parseSseData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
