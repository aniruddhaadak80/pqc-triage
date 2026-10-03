import type { ReactNode } from "react";
import type { RiskBand } from "@/lib/types";

/** Small printed-plate primitives shared by every route. */

export const BAND_TEXT: Record<RiskBand, string> = {
  critical: "text-order-1",
  high: "text-order-2",
  medium: "text-order-5",
  low: "text-order-3",
  clear: "text-order-4",
};

export const BAND_BG: Record<RiskBand, string> = {
  critical: "bg-order-1",
  high: "bg-order-2",
  medium: "bg-order-5",
  low: "bg-order-3",
  clear: "bg-order-4",
};

export const BAND_RULE: Record<RiskBand, string> = {
  critical: "border-order-1",
  high: "border-order-2",
  medium: "border-order-5",
  low: "border-order-3",
  clear: "border-order-4",
};

export const BAND_LABEL: Record<RiskBand, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  clear: "Clear",
};

export function SpectralRule({ className = "" }: { className?: string }) {
  return <div className={`spectral-band h-1.5 w-full ${className}`} aria-hidden="true" />;
}

export function SectionHead({
  index,
  title,
  lede,
  aside,
}: {
  index?: string;
  title: string;
  lede?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-3">
      <div className="max-w-2xl">
        {index ? <p className="plate-label mb-1">{index}</p> : null}
        <h2 className="display text-[1.65rem] font-semibold leading-tight">{title}</h2>
        {lede ? <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-2">{lede}</p> : null}
      </div>
      {aside}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-rule bg-paper-2/50 p-4 ${className}`}>{children}</div>;
}

export function BandChip({ band, score }: { band: RiskBand; score?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] ${BAND_TEXT[band]} ${BAND_RULE[band]}`}
    >
      <span className={`h-1.5 w-1.5 ${BAND_BG[band]}`} aria-hidden="true" />
      {BAND_LABEL[band]}
      {typeof score === "number" ? <span className="readout font-normal normal-case tracking-normal">{score}</span> : null}
    </span>
  );
}

export function Readout({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <p className="plate-label">{label}</p>
      <p className="readout mt-1 text-[1.05rem] font-medium leading-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[0.75rem] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}

/**
 * A decrypt window can already be in the past, and "-3.8y" is not a thing anyone
 * should read. Say how long ago instead.
 */
export function formatWindow(years: number | null | undefined): string {
  if (years === null || years === undefined || !Number.isFinite(years)) return "—";
  const rounded = Math.round(years * 10) / 10;
  if (rounded < 0) return `${Math.abs(rounded)}y ago`;
  if (rounded === 0) return "now";
  return `${rounded}y`;
}

export function windowHint(years: number | null | undefined): string {
  if (years === null || years === undefined || !Number.isFinite(years)) return "harvest window";
  return years < 0 ? "capture already decryptable" : "until the first capture breaks";
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grating border border-dashed border-rule bg-paper-2/40 px-6 py-12 text-center">
      <div className="mx-auto mb-4 flex h-10 w-32 items-end gap-1 opacity-40" aria-hidden="true">
        {[2, 5, 9, 6, 3, 8, 4].map((height, index) => (
          <span
            key={index}
            className="flex-1"
            style={{
              height: `${height * 3}px`,
              background: ["var(--color-order-1)", "var(--color-order-2)", "var(--color-order-3)", "var(--color-order-4)", "var(--color-order-5)"][index % 5],
            }}
          />
        ))}
      </div>
      <h3 className="display text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-[0.88rem] leading-relaxed text-ink-2">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Note({ tone, children }: { tone: "info" | "warn" | "ok"; children: ReactNode }) {
  const tones = {
    info: "border-order-3 bg-order-3/8 text-ink",
    warn: "border-order-5 bg-order-5/8 text-ink",
    ok: "border-order-4 bg-order-4/8 text-ink",
  } as const;
  return <p className={`border-l-2 px-3 py-2 text-[0.82rem] leading-relaxed ${tones[tone]}`}>{children}</p>;
}

export function LiveBadge({ status, label }: { status: "live" | "fallback"; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-ink-2">
      <span
        className={`h-1.5 w-1.5 ${status === "live" ? "bg-order-4" : "bg-order-5"}`}
        aria-hidden="true"
      />
      <span className="readout uppercase tracking-[0.12em]">{status}</span>
      {label ? <span className="text-ink-3">{label}</span> : null}
    </span>
  );
}

export function Button({
  children,
  variant = "solid",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" | "ghost" }) {
  const variants = {
    solid: "bg-ink text-paper border border-ink hover:bg-ink-2",
    outline: "border border-rule bg-paper text-ink hover:bg-paper-3",
    ghost: "border border-transparent text-ink-2 hover:bg-paper-2 hover:text-ink",
  } as const;
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 text-[0.85rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}