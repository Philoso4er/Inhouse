import type { FrameFinish } from "../types";

interface Props {
  imageDataUrl: string;
  frame: FrameFinish;
}

const FRAME_STYLES: Record<FrameFinish, { border: string; mat: boolean }> = {
  walnut: { border: "var(--walnut)", mat: true },
  black: { border: "#151515", mat: true },
  white: { border: "#f2f0ea", mat: true },
};

export default function GalleryFrame({ imageDataUrl, frame }: Props) {
  const style = FRAME_STYLES[frame];
  const frameWidth = 16;
  const matWidth = style.mat ? 18 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {/* hanging wire */}
      <svg width="120" height="34" viewBox="0 0 120 34" aria-hidden style={{ opacity: 0.5 }}>
        <path d="M10 0 L60 30 L110 0" stroke="var(--ink-soft)" strokeWidth="1" fill="none" />
        <circle cx="10" cy="0" r="2" fill="var(--ink-soft)" />
        <circle cx="110" cy="0" r="2" fill="var(--ink-soft)" />
      </svg>

      <div
        style={{
          padding: frameWidth,
          background: style.border,
          borderRadius: 2,
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06)",
          maxWidth: 420,
          width: "100%",
        }}
      >
        <div
          style={{
            padding: matWidth,
            background: style.mat ? "var(--paper)" : "transparent",
          }}
        >
          <img
            src={imageDataUrl}
            alt="Your uploaded artwork, previewed in a frame"
            style={{
              display: "block",
              width: "100%",
              aspectRatio: "4 / 5",
              objectFit: "cover",
              boxShadow: style.mat ? "0 0 0 1px rgba(0,0,0,0.08)" : "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
