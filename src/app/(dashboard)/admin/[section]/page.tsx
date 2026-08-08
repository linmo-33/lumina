import { notFound } from "next/navigation";
import AdminConsole, { type AdminSection } from "../admin-console";

const adminSections = new Set<AdminSection>([
  "users",
  "quota",
  "usage",
  "strategies",
  "settings",
]);
const pageSizes = new Set([10, 20, 50, 100]);

function readPositiveInteger(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function AdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!adminSections.has(section as AdminSection)) notFound();

  const page = readPositiveInteger(query.page, 1);
  const requestedPageSize = readPositiveInteger(query.pageSize, 10);
  const pageSize = pageSizes.has(requestedPageSize) ? requestedPageSize : 10;
  const rawSearch = Array.isArray(query.q) ? query.q[0] : query.q;
  const search = (rawSearch ?? "").trim().slice(0, 100);

  return (
    <AdminConsole
      key={`${section}:${page}:${pageSize}:${search}`}
      section={section as AdminSection}
      initialPage={page}
      initialPageSize={pageSize}
      initialSearch={search}
    />
  );
}
