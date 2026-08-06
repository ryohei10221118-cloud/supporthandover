import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "案件追踪看板",
  description: "跨team案件追踪状态看板",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
