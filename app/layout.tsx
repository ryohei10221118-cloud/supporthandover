import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T1HO case board",
  description: "跨team案件追蹤狀態看板",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
