import { NextRequest, NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/schema";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().trim().min(2, "昵称至少需要 2 个字符").max(40),
  email: z.string().trim().email("请输入有效的邮箱地址"),
  password: z.string().min(8, "密码至少需要 8 位").max(128),
  code: z.string().regex(/^\d{6}$/, "请输入 6 位邮箱验证码"),
});

function getApiErrorCode(error: unknown) {
  if (!(error instanceof APIError)) return undefined;
  return error.body?.code;
}

export async function POST(request: NextRequest) {
  try {
    const input = registerSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    const [existingUser] = await db
      .select({ id: user.id, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser?.emailVerified) {
      return NextResponse.json(
        { error: "该邮箱已注册，请直接登录" },
        { status: 409 },
      );
    }

    if (existingUser) {
      try {
        await auth.api.signInEmail({
          body: { email, password: input.password },
          headers: request.headers,
        });
      } catch (error) {
        if (getApiErrorCode(error) !== "EMAIL_NOT_VERIFIED") {
          return NextResponse.json(
            { error: "该邮箱已有待验证账号，密码不匹配" },
            { status: 409 },
          );
        }
      }
    } else {
      const result = await auth.api.signUpEmail({
        body: {
          name: input.name,
          email,
          password: input.password,
        },
        headers: request.headers,
      });
      const [createdUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      if (!createdUser || createdUser.id !== result.user.id) {
        return NextResponse.json(
          { error: "该邮箱已被占用，请直接登录或更换邮箱" },
          { status: 409 },
        );
      }
    }

    const verificationResult = await auth.api.verifyEmailOTP({
      body: { email, otp: input.code },
      headers: request.headers,
    });

    if (!verificationResult.status) {
      return NextResponse.json(
        { error: "验证码错误或已失效" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "注册信息不正确" },
        { status: 400 },
      );
    }

    const code = getApiErrorCode(error);
    if (code === "INVALID_OTP" || code === "OTP_EXPIRED") {
      return NextResponse.json(
        { error: code === "OTP_EXPIRED" ? "验证码已失效" : "验证码错误" },
        { status: 400 },
      );
    }
    if (code === "TOO_MANY_ATTEMPTS") {
      return NextResponse.json(
        { error: "验证码尝试次数过多，请重新获取" },
        { status: 429 },
      );
    }

    console.error("[register] failed", error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 },
    );
  }
}
