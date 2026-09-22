import { signOut } from "@/lib/actions/auth";
import type { CurrentUser } from "@/lib/auth";

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-30 bg-brand-800 text-white">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-lg font-black"
        >
          K
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">Kapa Service Log</p>
          <p className="truncate text-xs text-brand-100">
            {user.name}
            {user.company ? ` · ${user.company}` : ""}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-100 hover:bg-white/10"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
