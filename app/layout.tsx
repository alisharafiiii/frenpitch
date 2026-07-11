import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { NavBar } from "./components/nav/NavBar";

export const metadata: Metadata = {
  title: "frenpitch ⚽",
  description: "frens live in a stadium. picks, tournaments, quizzes — world cup edition.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* telegram web-app bridge — REQUIRED for identity, fullscreen
            expand, native share picker, everything tg-native */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>
        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <main style={{ flex: 1, padding: "16px 16px 72px" }}>{children}</main>
          <NavBar />
        </div>
      </body>
    </html>
  );
}
