"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLoading } from "@/components/app-shell";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" })
      .then((response) => response.json())
      .then((status) => {
        router.replace(status.configured ? "/generate" : "/setup");
      })
      .catch(() => router.replace("/setup"));
  }, [router]);

  return <AppLoading label="正在检查 Lumina 状态…" />;
}
