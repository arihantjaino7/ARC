import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

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
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {user.email}
        </p>

        <ResetPasswordForm />
      </div>
    </div>
  );
}
