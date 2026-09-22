import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <>
      <AppHeader user={user} />
      {/* Bottom padding clears the fixed nav plus the iOS home indicator. */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-5 pb-28">{children}</main>
      <BottomNav isAdmin={user.is_admin} />
    </>
  );
}
