import { ResetPasswordForm } from "./reset-password-form";

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = firstSearchParam(params.token) ?? "";
  const error = firstSearchParam(params.error);

  return <ResetPasswordForm token={token} initiallyInvalid={!token || error === "INVALID_TOKEN"} />;
}
