import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumina · 让灵感成为画面",
  description: "温暖、轻松的自托管 AI 图像生成与作品管理工具",
  icons: {
    icon: [{ url: "/lumina-logo.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/lumina-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased font-sans">
      <body className="min-h-full">
        <TooltipProvider>
          <Toaster position="top-right" />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
