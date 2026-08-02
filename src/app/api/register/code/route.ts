import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendVerificationCodeEmail } from "@/lib/email";
import { user, verification } from "@/lib/schema";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().trim().email("请输入有效的邮箱地址"),
});

const RESEND_COOLDOWN_MS = 60_000;

function getIdentifier(email: string) {
  return `email-verification-otp-${email}`;
}

export async function POST(request: NextRequest) {
  try {
    const input = requestSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    const [existingUser] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser?.emailVerified) {
      return NextResponse.json(
        { error: "该邮箱已注册，请直接登录" },
        { status: 409 },
      );
    }

    const identifier = getIdentifier(email);
    const [currentCode] = await db
      .select({
        createdAt: verification.createdAt,
        updatedAt: verification.updatedAt,
      })
      .from(verification)
      .where(eq(verification.identifier, identifier))
      .orderBy(desc(verification.updatedAt))
      .limit(1);
    const lastSentAt = currentCode?.updatedAt ?? currentCode?.createdAt;

    if (lastSentAt) {
      const retryAfter = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - lastSentAt.getTime())) / 1000,
      );
      if (retryAfter > 0) {
        return NextResponse.json(
          { error: `请 ${retryAfter} 秒后再试`, retryAfter },
          { status: 429 },
        );
      }
    }

    await db
      .delete(verification)
      .where(eq(verification.identifier, identifier));
    const code = await auth.api.createVerificationOTP({
      body: { email, type: "email-verification" },
    });

    try {
      await sendVerificationCodeEmail({
        email,
        code,
        type: "email-verification",
      });
    } catch (error) {
      await db
        .delete(verification)
        .where(eq(verification.identifier, identifier));
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "邮箱地址不正确" },
        { status: 400 },
      );
    }

    console.error("[register-code] failed", error);
    return NextResponse.json(
      { error: "验证码发送失败，请稍后重试" },
      { status: 503 },
    );
  }
}
