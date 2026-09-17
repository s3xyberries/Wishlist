"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Heart, Library, Search } from "lucide-react";
import { RegionSwitcher } from "@/components/region-switcher";
import { useWishlistStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Search", icon: Search },
  { href: "/catalog", label: "Catalog", icon: Library },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/notifications", label: "Alerts", icon: Bell },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { unreadCount } = useWishlistStore();

  return (
    <div className="relative flex min-h-full flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(15,118,110,0.18),transparent_68%)] blur-2xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.08),transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f766e' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-heading text-xl tracking-tight text-teal-800 transition-colors group-hover:text-teal-700 sm:text-2xl">
              Pricekeep
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              wishlist · prices · alerts
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <RegionSwitcher />
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-teal-800/10 text-teal-900"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                    {item.href === "/notifications" && unreadCount > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-teal-700 text-[10px] font-medium text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        AU-first · shared SQLite catalog · scrape when stale · daily price check
      </footer>
    </div>
  );
}
