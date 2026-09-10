import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordContent } from "./ResetPasswordContent";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only reachable with a session from a just-used reset link — see
  // src/app/auth/confirm/route.ts, which is what sets it before redirecting
  // here.
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-gutter py-16">
      <ResetPasswordContent email={user.email} />
    </div>
  );
}
