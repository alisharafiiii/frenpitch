"use client";

import Link from "next/link";
import ui from "@/app/styles/ui.module.css";

export default function TournamentsPage() {
  return (
    <>
      <div className={ui.sectionLabel}>🏆 your tournaments</div>
      <div className={ui.emptyState}>
        no tournaments yet — create one and drag your frens in ⚔️
      </div>
      <Link
        href="/tournaments/new"
        className={ui.btnPrimary}
        style={{ textAlign: "center", textDecoration: "none", display: "block" }}
      >
        ⚔️ create tournament
      </Link>
    </>
  );
}
