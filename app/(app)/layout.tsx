import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-10">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
