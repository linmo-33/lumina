import { Resend } from "resend";
import {
  buildVerificationCodeEmail,
  type VerificationCodeType,
} from "./email-templates/verification-code";
import { buildPasswordResetEmail } from "./email-templates/password-reset";
import {
  PASSWORD_RESET_EXPIRES_IN_MINUTES,
} from "./auth-constants";

export const VERIFICATION_CODE_EXPIRES_IN_SECONDS = 10 * 60;

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || apiKey === "re_your_api_key") {
    throw new Error("邮件服务未配置：缺少有效的 RESEND_API_KEY");
  }

  if (!from || from.includes("example.com")) {
    throw new Error("邮件服务未配置：缺少有效的 RESEND_FROM_EMAIL");
  }

  return { apiKey, from };
}

export function getEmailServiceStatus() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  return {
    apiKey: Boolean(apiKey && apiKey !== "re_your_api_key"),
    from: Boolean(from && !from.includes("example.com")),
  };
}

export async function sendVerificationCodeEmail(input: {
  email: string;
  code: string;
  type: VerificationCodeType;
}) {
  const content = buildVerificationCodeEmail({
    code: input.code,
    type: input.type,
    expiresInMinutes: VERIFICATION_CODE_EXPIRES_IN_SECONDS / 60,
  });
  await sendEmail({
    to: input.email,
    ...content,
    failureMessage: "验证码邮件发送失败，请稍后重试",
  });
}

export async function sendPasswordResetEmail(input: { email: string; url: string }) {
  const content = buildPasswordResetEmail({
    url: input.url,
    expiresInMinutes: PASSWORD_RESET_EXPIRES_IN_MINUTES,
  });
  await sendEmail({
    to: input.email,
    ...content,
    failureMessage: "密码重置邮件发送失败，请稍后重试",
  });
}

async function sendEmail(input: { to: string; subject: string; html: string; text: string; failureMessage: string }) {
  const { apiKey, from } = getEmailConfig();
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    console.error("[email] Resend request failed", {
      name: error.name,
      message: error.message,
    });
    throw new Error(input.failureMessage);
  }
}
