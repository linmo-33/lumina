import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const currentUser = session.user as typeof session.user & { role?: string };
  return currentUser.role === "admin" ? session : null;
}
