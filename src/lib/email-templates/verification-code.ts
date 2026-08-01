export type VerificationCodeType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

interface VerificationCodeEmailInput {
  code: string;
  type: VerificationCodeType;
  expiresInMinutes: number;
}

const purposeCopy: Record<
  VerificationCodeType,
  { subject: string; eyebrow: string; description: string }
> = {
  "email-verification": {
    subject: "验证你的 Lumina 邮箱",
    eyebrow: "完成注册",
    description: "输入下面的验证码，完成 Lumina 账号的邮箱认证。",
  },
  "sign-in": {
    subject: "你的 Lumina 登录验证码",
    eyebrow: "登录验证",
    description: "输入下面的验证码，继续登录 Lumina。",
  },
  "forget-password": {
    subject: "重置你的 Lumina 密码",
    eyebrow: "重置密码",
    description: "输入下面的验证码，继续重置 Lumina 账号密码。",
  },
  "change-email": {
    subject: "验证你的新邮箱",
    eyebrow: "更换邮箱",
    description: "输入下面的验证码，确认 Lumina 账号的新邮箱。",
  },
};

export function buildVerificationCodeEmail({
  code,
  type,
  expiresInMinutes,
}: VerificationCodeEmailInput) {
  const copy = purposeCopy[type];
  const spacedCode = code.split("").join(" ");

  return {
    subject: copy.subject,
    text: `${copy.description}\n\n验证码：${code}\n\n验证码将在 ${expiresInMinutes} 分钟后失效。如果不是你本人操作，请忽略这封邮件。`,
    html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${copy.subject}</title>
  </head>
  <body style="margin:0;background:#f4f1e8;color:#554c40;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${copy.description} 验证码 ${code}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f1e8;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#fffdf7;border:1px solid #ddd5c7;border-radius:28px;box-shadow:0 8px 0 rgba(85,76,64,.08);overflow:hidden;">
            <tr>
              <td style="height:8px;background:#20b8ad;"></td>
            </tr>
            <tr>
              <td style="padding:36px 40px 16px;">
                <div style="font-size:24px;font-weight:900;letter-spacing:-.02em;color:#554c40;">✦ Lumina</div>
                <div style="display:inline-block;margin-top:22px;padding:7px 13px;border-radius:999px;background:#fff0b8;color:#806323;font-size:12px;font-weight:800;letter-spacing:.12em;">${copy.eyebrow}</div>
                <h1 style="margin:20px 0 10px;font-size:26px;line-height:1.35;color:#554c40;">${copy.subject}</h1>
                <p style="margin:0;color:#8b8274;font-size:15px;line-height:1.8;">${copy.description}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 40px 18px;">
                <div style="padding:22px 16px;border:2px dashed #b8aa91;border-radius:22px;background:#f7f3e8;color:#148f87;font-size:34px;font-weight:900;letter-spacing:.2em;text-align:center;">${spacedCode}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 40px 38px;">
                <p style="margin:0;color:#8b8274;font-size:13px;line-height:1.75;">验证码将在 <strong style="color:#554c40;">${expiresInMinutes} 分钟</strong>后失效，请勿转发给他人。</p>
                <p style="margin:10px 0 0;color:#a49a8b;font-size:12px;line-height:1.7;">如果不是你本人操作，可以放心忽略这封邮件。</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 40px;background:#eef5f1;color:#72837c;font-size:12px;text-align:center;">让每一个灵感，都有清晰的模样。</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}
