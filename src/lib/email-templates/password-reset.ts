interface PasswordResetEmailInput {
  url: string;
  expiresInMinutes: number;
}

const htmlEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEscapeMap[character]);
}

export function buildPasswordResetEmail({ url, expiresInMinutes }: PasswordResetEmailInput) {
  const safeUrl = escapeHtml(url);
  const subject = "重置你的 Lumina 密码";

  return {
    subject,
    text: `有人申请重置你的 Lumina 账号密码。请在 ${expiresInMinutes} 分钟内打开下面的链接：\n\n${url}\n\n如果不是你本人操作，请忽略这封邮件，你的密码不会改变。`,
    html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;background:#f4f1e8;color:#554c40;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">打开安全链接，重置你的 Lumina 密码。</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f1e8;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#fffdf7;border:1px solid #ddd5c7;border-radius:28px;box-shadow:0 8px 0 rgba(85,76,64,.08);overflow:hidden;">
            <tr><td style="height:8px;background:#6d55f6;"></td></tr>
            <tr>
              <td style="padding:36px 40px 18px;">
                <div style="font-size:24px;font-weight:900;letter-spacing:-.02em;color:#554c40;">✦ Lumina</div>
                <div style="display:inline-block;margin-top:22px;padding:7px 13px;border-radius:999px;background:#f3efff;color:#5942d6;font-size:12px;font-weight:800;letter-spacing:.12em;">账号安全</div>
                <h1 style="margin:20px 0 10px;font-size:26px;line-height:1.35;color:#554c40;">${subject}</h1>
                <p style="margin:0;color:#8b8274;font-size:15px;line-height:1.8;">点击下方按钮设置新密码。完成后，当前账号的其他登录会话将自动退出。</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 40px 22px;">
                <a href="${safeUrl}" style="display:block;padding:15px 22px;border-radius:14px;background:#6d55f6;color:#ffffff;font-size:15px;font-weight:800;text-align:center;text-decoration:none;">重置密码</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 38px;">
                <p style="margin:0;color:#8b8274;font-size:13px;line-height:1.75;">链接将在 <strong style="color:#554c40;">${expiresInMinutes} 分钟</strong>后失效，并且只能使用一次。</p>
                <p style="margin:10px 0 0;color:#a49a8b;font-size:12px;line-height:1.7;">如果不是你本人操作，可以忽略这封邮件，你的密码不会改变。</p>
              </td>
            </tr>
            <tr><td style="padding:18px 40px;background:#eef5f1;color:#72837c;font-size:12px;text-align:center;">让每一个灵感，都有清晰的模样。</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}
