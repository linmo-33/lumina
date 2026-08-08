import AdminConsole from "./admin-console";

export default function AdminPage() {
  return <AdminConsole section="overview" initialPage={1} initialPageSize={10} />;
}
