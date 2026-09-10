import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeContent } from "./WelcomeContent";

/**
 * The signed-out landing page. "/" itself belongs to the (app) shell, so an
 * anonymous visitor is sent here rather than straight at a login form.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-gutter text-center">
      <WelcomeContent />
    </div>
  );
}
