import { redirect } from "next/navigation";
import { TabBar } from "@/components/TabBar";
import { createClient } from "@/lib/supabase/server";
import { getUnreadSections } from "@/lib/notifications/actions";

/**
 * The signed-in shell: everything inside the (app) route group gets the bottom
 * tab bar and is gated on a session. src/proxy.ts already bounces anonymous
 * requests, but the check is repeated here so the pages below can rely on a
 * user existing without each doing its own redirect.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/welcome");
  }

  const unread = await getUnreadSections();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 flex-col pb-4">{children}</main>
      <TabBar unread={unread} />
    </div>
  );
}
