import Link from "next/link";

/**
 * The common frame every tab screen sits in: a centred column, a title, an
 * optional one-line subtitle, and an optional back link for sub-pages.
 */
export function Screen({
  title,
  subtitle,
  back,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-8">
      {back && (
        <Link
          href={back.href}
          className="text-sm text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
        >
          &larr; {back.label}
        </Link>
      )}

      <div className={`flex items-start justify-between gap-3 ${back ? "mt-4" : ""}`}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
        </div>
        {action}
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}

/** A bordered box — the app's one card style, used everywhere. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      {children}
    </div>
  );
}

/** The "nothing here yet" state, with a single call to action. */
export function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center dark:border-zinc-700">
      <p className="text-sm font-medium text-black dark:text-zinc-50">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
        {body}
      </p>
      {cta && <div className="mt-5 flex justify-center gap-2">{cta}</div>}
    </div>
  );
}
