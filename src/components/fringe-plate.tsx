import type { RiskBand } from "@/lib/types";
import { BAND_BG, BAND_LABEL } from "./plate";

/**
 * The signature visual: a diffraction plate.
 *
 * Every surface becomes one fringe. Its horizontal position is the year its
 * data becomes decryptable, its height is the engine score, and the faint
 * duplicate four pixels to its right is the interference that makes overlapping
 * fringes readable as a spectrum. Nothing here is decorative: move the horizon
 * and every fringe moves, because the positions are computed from the engine's
 * own deadline arithmetic.
 */

export type FringeItem = {
  id: string;
  label: string;
  score: number;
  band: RiskBand;
  decryptableFrom: number;
  mustStartBy: number;
};

const MIN_SPAN = 8;

export function FringePlate({
  items,
  nowYear,
  horizonYear,
  deprecateYear,
  disallowYear,
  height = 168,
  showLabels = true,
}: {
  items: FringeItem[];
  nowYear: number;
  horizonYear: number;
  deprecateYear: number;
  disallowYear: number;
  height?: number;
  showLabels?: boolean;
}) {
  const years = [nowYear - 1, horizonYear + 4];
  const span = Math.max(MIN_SPAN, years[1] - years[0] + 1);
  const start = nowYear - 1;
  const position = (year: number) => ((year - start) / span) * 100;

  const ticks: number[] = [];
  const tickStep = span > 24 ? 5 : span > 12 ? 2 : 1;
  for (let year = Math.ceil(start / tickStep) * tickStep; year <= years[1]; year += tickStep) {
    if (year >= start) ticks.push(year);
  }

  const plotHeight = showLabels ? height - 30 : height;

  return (
    <figure className="m-0">
      <div
        className="grating relative w-full border border-rule bg-paper"
        style={{ height: `${height}px` }}
        role="img"
        aria-label={`Diffraction plate: ${items.length} cryptographic surfaces plotted by the year their data becomes decryptable, against a ${horizonYear} quantum-capability horizon.`}
      >
        {ticks.map((year) => (
          <div key={year} className="absolute bottom-0 top-0" style={{ left: `${position(year)}%` }} aria-hidden="true">
            <div className="h-full w-px bg-rule/70" />
            {showLabels ? (
              <span className="readout absolute -bottom-6 left-0 text-[0.62rem] text-ink-3">{year}</span>
            ) : null}
          </div>
        ))}

        {/* NIST deadlines, etched rather than drawn. */}
        {[deprecateYear, disallowYear].map((year) => (
          <div
            key={year}
            className="absolute bottom-0 top-0 border-l border-dashed border-order-5/70"
            style={{ left: `${position(year)}%` }}
            aria-hidden="true"
          />
        ))}

        {/* The horizon itself. */}
        <div
          className="absolute bottom-0 top-0 w-[2px] bg-ink"
          style={{ left: `${position(horizonYear)}%` }}
          aria-hidden="true"
        />

        {/* Fringes are clipped to the plot so a surface that is already
            decryptable, and therefore plots to the left of the first tick,
            cannot draw outside the plate. The label strip sits below the
            grating, so the clip layer stops short of the year labels. */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          {items.map((item, index) => {
            const left = position(item.decryptableFrom);
            const before = left < 0;
            const after = left > 100;
            const drawn = Math.min(100, Math.max(0, left));
            const barHeight = Math.max(6, (Math.min(100, Math.max(0, item.score)) / 100) * (plotHeight - 26));
            const stagger = (index % 3) * 3;
            return (
              <div key={item.id} className="absolute bottom-0" style={{ left: `${drawn}%` }} title={`${item.label}: ${BAND_LABEL[item.band]} ${item.score}, decryptable from ${item.decryptableFrom}, start by ${item.mustStartBy}`}>
                <div className="absolute bottom-[26px] flex flex-col justify-end" style={{ height: `${plotHeight - 26}px` }}>
                  <div
                    className={`fringe-live w-[2px] ${BAND_BG[item.band]}`}
                    style={{ height: `${barHeight}px`, animationDelay: `${stagger * 900}ms` }}
                  />
                  <div
                    className={`absolute w-[2px] opacity-40 ${BAND_BG[item.band]}`}
                    style={{ left: "4px", bottom: 0, height: `${Math.max(3, barHeight - stagger * 6)}px` }}
                  />
                </div>
                {before || after ? (
                  <span className="readout absolute bottom-[26px] left-[3px] text-[0.6rem] text-critical">
                    !
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="absolute left-2 top-1.5 flex gap-3 text-[0.62rem] text-ink-3" aria-hidden="true">
          <span className="readout">H {horizonYear}</span>
          <span className="readout">NIST dep {deprecateYear}</span>
          <span className="readout">NIST dis {disallowYear}</span>
        </div>
      </div>
      {showLabels ? <div className="h-6" aria-hidden="true" /> : null}
    </figure>
  );
}