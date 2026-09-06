import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
        Gym-Shym
      </h1>
      <p className="mt-4 max-w-md text-balance text-lg text-zinc-500 dark:text-zinc-400">
        Compete with your gym buddy on effort towards your own goal &mdash; not
        who lifted more.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
