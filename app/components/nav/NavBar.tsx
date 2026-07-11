"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./nav.module.css";

const items = [
  { href: "/", key: "odds", label: "odds" },
  { href: "/stadium", key: "stadium", label: "stadium" },
  { href: "/tournaments", key: "tours", label: "tours" },
  { href: "/quiz", key: "quiz", label: "quiz" },
  { href: "/me", key: "me", label: "me" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.bar}>
      {items.map(({ href, key, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? styles.itemActive : styles.item}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/nav-${key}-${active ? "on" : "off"}.webp`}
              alt=""
              className={styles.icoImg}
            />
            {label}
            {active && <span className={styles.activeDot} />}
          </Link>
        );
      })}
    </nav>
  );
}
