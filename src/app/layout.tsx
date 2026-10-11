import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "MEVIX · نظام الإدارة", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="ar" dir="rtl"><body>{children}</body></html>);
}
