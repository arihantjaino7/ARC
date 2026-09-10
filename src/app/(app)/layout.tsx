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
    <div className="flex min-h-full flex-1 flex-col">
      <main
        className="flex flex-1 flex-col"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 96px)" }}
      >
        {children}
      </main>
      <TabBar unread={unread} />
    </div>
  );
}
