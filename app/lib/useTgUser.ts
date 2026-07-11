"use client";

import { useEffect, useState } from "react";
import { getTgUser, type TgUser } from "./telegram";

/** reactive tg identity — the bridge can populate a beat after first
 *  render on slow clients, so keep checking until the real user shows
 *  up (max ~5s) instead of sampling once. */
export function useTgUser(): TgUser {
  const [user, setUser] = useState<TgUser>(() => getTgUser());

  useEffect(() => {
    if (user.id !== 0) return;
    let tries = 0;
    const t = setInterval(() => {
      const u = getTgUser();
      tries++;
      if (u.id !== 0) {
        setUser(u);
        clearInterval(t);
      } else if (tries > 12) {
        clearInterval(t);
      }
    }, 400);
    return () => clearInterval(t);
  }, [user.id]);

  return user;
}
