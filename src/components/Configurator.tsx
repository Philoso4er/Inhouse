import { FRAME_FINISHES, SIZE_OPTIONS, type FrameFinish } from "../types";

interface Props {
  sizeId: string;
  frame: FrameFinish;
  onSizeChange: (id: string) => void;
  onFrameChange: (frame: FrameFinish) => void;
}

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-soft)",
  opacity: 0.65,
  marginBottom: 10,
  display: "block",
};

export default function Configurator({ sizeId, frame, onSizeChange, onFrameChange }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <span style={labelStyle}>Size</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SIZE_OPTIONS.map((s) => {
            const active = s.id === sizeId;
            return (
              <button
                key={s.id}
                onClick={() => onSizeChange(s.id)}
                style={{
                  padding: "10px 14px",
                  border: `1px solid ${active ? "var(--ink)" : "var(--wall-shadow)"}`,
                  background: active ? "var(--ink)" : "transparent",
                  color: active ? "var(--paper)" : "var(--ink)",
                  borderRadius: 2,
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  minWidth: 92,
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 11, opacity: 0.75 }}>{s.inches}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span style={labelStyle}>Frame</span>
        <div style={{ display: "flex", gap: 10 }}>
          {FRAME_FINISHES.map((f) => {
            const active = f.id === frame;
            return (
              <button
                key={f.id}
                onClick={() => onFrameChange(f.id)}
                aria-label={f.label}
                title={f.label}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: active ? "2px solid var(--brass)" : "1px solid var(--wall-shadow)",
                  background: f.swatch,
                  padding: 0,
                  position: "relative",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
