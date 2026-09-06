// Where Supabase's password-recovery (and other OTP-style) email links land.
// Verifying/exchanging here, server-side, sets the session cookie directly
// via our own Supabase client — no client-side URL-fragment parsing needed.
//
// This project's Supabase clients default to the PKCE flow, so the actual
// link Supabase sends carries a `?code=...` query param (handled below via
// exchangeCodeForSession). `token_hash`/`type` is also handled as a fallback,
// in case an email template is ever customized to use that style instead.

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(next);
    }
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login");
}
