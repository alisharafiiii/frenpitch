"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./nav.module.css";

const items = [
  { href: "/", ico: "⚡", label: "odds" },
  { href: "/stadium", ico: "🏟️", label: "stadium" },
  { href: "/tournaments", ico: "🏆", label: "tours" },
  { href: "/quiz", ico: "🧠", label: "quiz" },
  { href: "/me", ico: "👤", label: "me" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.bar}>
      {items.map((it) => {
        const active =
          it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={active ? styles.itemActive : styles.item}
          >
            <span className={styles.ico}>{it.ico}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
