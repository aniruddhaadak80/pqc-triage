import Link from "next/link";
import { navItems, site } from "@/config/site";
import { SpectralRule } from "@/components/plate";
import { GitHubMark } from "@/components/github-mark";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
      <p className="plate-label">404</p>
      <h1 className="display mt-2 text-[2.1rem] font-semibold leading-tight">
        No plate at those coordinates.
      </h1>
      <SpectralRule className="mt-5" />
      <p className="mt-5 text-[0.95rem] leading-relaxed text-ink-2">
        The page does not exist, or it belongs to an anonymous session other than yours. Surveys are owned by an
        HttpOnly cookie: there is no account to log into, and no way to see another visitor&apos;s inventory. If you
        published a report and the link stopped working, the owner revoked it.
      </p>
      <ul className="mt-6 flex flex-wrap gap-2">
        <li>
          <Link href="/" className="border border-ink bg-ink px-3 py-2 text-[0.85rem] font-medium text-paper hover:bg-ink-2">
            Back to the plate
          </Link>
        </li>
        {navItems.slice(0, 4).map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="border border-rule bg-paper-2 px-3 py-2 text-[0.85rem] hover:bg-paper-3">
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-rule bg-paper-2 px-3 py-2 text-[0.85rem] hover:bg-paper-3"
            aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
          >
            <GitHubMark />
            GitHub
          </a>
        </li>
      </ul>
    </div>
  );
}