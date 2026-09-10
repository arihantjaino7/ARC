"use client";

// Stagger.Item needs a Client Component to resolve — see the identical note
// in src/app/welcome/WelcomeContent.tsx. JoinPage is a Server Component (it
// awaits the invite-preview RPC), so the Stagger wrapper lives here; the
// server-rendered branch content is passed in as children, same pattern
// icons/rendered elements cross the RSC boundary elsewhere in this app.

import { Stagger } from "@/components/ui/Stagger";

export function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-gutter py-16">
      <Stagger className="w-full max-w-sm">
        <Stagger.Item>{children}</Stagger.Item>
      </Stagger>
    </div>
  );
}
