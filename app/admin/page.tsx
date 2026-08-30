// app/admin/page.tsx
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySession } from "../../lib/adminAuth";
import AdminDashboard from "../../components/AdminDashboard";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const session = verifySession(cookies().get(ADMIN_COOKIE)?.value);
  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100">
        <a
          href="/api/auth/github/login"
          className="rounded-lg border border-gray-700 px-6 py-3 text-lg hover:bg-gray-800"
        >
          Sign in with GitHub to open the control tower
        </a>
      </main>
    );
  }
  return <AdminDashboard login={session.login} />;
}
