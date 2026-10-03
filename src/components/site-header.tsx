import Link from "next/link";
import { navItems, site } from "@/config/site";
import { GitHubMark } from "./github-mark";

/**
 * Shared navigation. The repository link is rendered here twice on purpose:
 * once in the desktop rail and once inside the mobile disclosure, so it is
 * reachable at every width without a client-side menu that would hide it from
 * the server-rendered HTML.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/92 backdrop-blur-sm no-print">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label={`${site.name} home`}>
          <span className="flex h-7 w-7 items-end gap-[2px]" aria-hidden="true">
            <span className="h-2 w-[3px] bg-order-1" />
            <span className="h-4 w-[3px] bg-order-2" />
            <span className="h-7 w-[3px] bg-order-3" />
            <span className="h-5 w-[3px] bg-order-4" />
            <span className="h-3 w-[3px] bg-order-5" />
          </span>
          <span className="display text-[1.05rem] font-semibold leading-none tracking-tight">
            {site.name}
          </span>
        </Link>

        <nav aria-label="Product" className="ml-auto hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-2.5 py-1.5 text-[0.82rem] text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <a
          href={site.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 rounded border border-rule bg-paper-2 px-2.5 py-1.5 text-[0.82rem] font-medium text-ink transition-colors hover:bg-paper-3 md:ml-2"
          aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
        >
          <GitHubMark />
          <span className="hidden sm:inline">Star on GitHub</span>
          <span className="sm:hidden">GitHub</span>
        </a>

        <details className="relative md:hidden">
          <summary
            className="cursor-pointer list-none rounded border border-rule px-2.5 py-1.5 text-[0.82rem] text-ink marker:hidden"
            aria-label="Open navigation menu"
          >
            Menu
          </summary>
          <div className="absolute right-0 z-50 mt-2 w-56 border border-rule bg-paper p-2 shadow-[0_18px_40px_-24px_rgba(20,17,13,0.55)]">
            <ul className="flex flex-col">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex flex-col rounded px-2 py-2 text-sm text-ink hover:bg-paper-2"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="text-[0.72rem] leading-snug text-ink-3">{item.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1.5 rounded bg-paper-2 px-2 py-2 text-sm font-medium text-ink"
              aria-label={`View the ${site.name} source on GitHub (opens in a new tab)`}
            >
              <GitHubMark />
              View source
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}