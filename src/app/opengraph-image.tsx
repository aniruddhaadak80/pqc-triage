import { ImageResponse } from "next/og";
import { NIST_TIMELINE } from "@/lib/crypto-registry";

export const alt = "PQC Triage: a printed diffraction plate with spectral exposure bands";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The plate, drawn from the same palette as the application. */
export default function OpengraphImage() {
  const bars = [38, 74, 52, 96, 61, 84, 44, 70, 33, 88, 57, 76, 47, 91, 64, 41, 80, 55];
  const colors = ["#b4305e", "#7a3ea8", "#1f6f8b", "#2e7d5b", "#a8620a"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f2efe7",
          color: "#14110d",
          padding: 56,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
            {colors.map((color, index) => (
              <div key={index} style={{ width: 6, height: 12 + index * 6, background: color }} />
            ))}
          </div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>PQC Triage</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.06, maxWidth: 1000 }}>
            Find the cryptography a quantum computer breaks first.
          </div>
          <div style={{ fontSize: 30, color: "#3d362c" }}>
            And the exact year you must start migrating by.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
            {bars.map((height, index) => (
              <div
                key={index}
                style={{ width: 12, height, background: colors[index % colors.length], opacity: 0.9 }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#6b6152" }}>
            <span>NIST deprecate {NIST_TIMELINE.deprecateBy}</span>
            <span>NIST disallow {NIST_TIMELINE.disallowFrom}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}