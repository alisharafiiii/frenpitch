"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBolt, IconStadium, IconTrophy, IconBrain, IconUser } from "@/app/components/icons";
import styles from "./nav.module.css";

const items = [
  { href: "/", Icon: IconBolt, label: "odds" },
  { href: "/stadium", Icon: IconStadium, label: "stadium" },
  { href: "/tournaments", Icon: IconTrophy, label: "tours" },
  { href: "/quiz", Icon: IconBrain, label: "quiz" },
  { href: "/me", Icon: IconUser, label: "me" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.bar}>
      {items.map(({ href, Icon, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? styles.itemActive : styles.item}>
            <span className={styles.ico}>
              <Icon />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
