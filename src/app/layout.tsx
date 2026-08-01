import type { Metadata } from "next";
import "animal-island-ui/style";
import { AppNotifications } from "@/components/app-notifications";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumina · 让灵感成为画面",
  description: "温暖、轻松的自托管 AI 图像生成与作品管理工具",
  icons: {
    icon: "/lumina-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <AppNotifications />
        {children}
      </body>
    </html>
  );
}
