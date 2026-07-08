/** Minimal Telegram WebApp helper — no SDK dependency.
 *  Inside Telegram, window.Telegram.WebApp.initDataUnsafe.user gives us
 *  id / first_name / username / photo_url. Outside (dev), fall back to
 *  a mock user so the app runs in any browser.
 *
 *  IMPORTANT (production): validate initData server-side via HMAC with
 *  the bot token before trusting identity. */

export interface TgUser {
  id: number;
  name: string;
  username: string;
  photoUrl?: string;
}

interface TelegramWindow extends Window {
  Telegram?: {
    WebApp?: {
      initDataUnsafe?: {
        user?: {
          id: number;
          first_name: string;
          username?: string;
          photo_url?: string;
        };
      };
      ready?: () => void;
      expand?: () => void;
    };
  };
}

export function getTgUser(): TgUser {
  if (typeof window !== "undefined") {
    const tg = (window as TelegramWindow).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    const u = tg?.initDataUnsafe?.user;
    if (u) {
      return {
        id: u.id,
        name: u.first_name,
        username: u.username ?? u.first_name.toLowerCase(),
        photoUrl: u.photo_url,
      };
    }
  }
  return { id: 0, name: "nabu", username: "nabu" }; // dev fallback
}
