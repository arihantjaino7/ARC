"use client";

// Stagger.Item needs a Client Component to resolve — see the identical note
// in src/app/welcome/WelcomeContent.tsx. reset-password/page.tsx is a Server
// Component (it redirects if there's no session), so the staggered content
// lives here.

import { Stagger } from "@/components/ui/Stagger";
import { ResetPasswordForm } from "./ResetPasswordForm";

export function ResetPasswordContent({ email }: { email: string | null | undefined }) {
  return (
    <Stagger className="w-full max-w-sm">
      <Stagger.Item>
        <h1 className="text-title text-ink">Set a new password</h1>
        <p className="mt-1 text-body text-ink-muted">{email}</p>
      </Stagger.Item>
      <Stagger.Item>
        <ResetPasswordForm />
      </Stagger.Item>
    </Stagger>
  );
}
