import { useEffect, useState } from "react";
import { FRAME_LIP_IN, MIN_PRINT_DPI, type FrameFinish, type SizeOption } from "../types";
import type { PrintArea } from "../providers";

interface Props {
  imageDataUrl: string;
  frame: FrameFinish;
  size: SizeOption;
  // Print area of the provider actually fulfilling this order (from the quote).
  printArea?: PrintArea;
}

const FRAME_COLOURS: Record<FrameFinish, string> = {
  walnut: "var(--walnut)",
  black: "#151515",
  white: "#f2f0ea",
};

// Preview width of the longest print (20x30) in CSS px; every other size is
// drawn at the same px-per-inch so relative sizes are true to life.
const PX_PER_INCH = 14;
const FRAME_MOULDING_IN = 0.75;

/**
 * Accurate print preview.
 *
 * The order sends the image to Printify as print_areas.front with default
 * placement (centred, scale 1 = image width spans the full print-area width).
 * So this preview does the same: the image fills the print-area width, is
 * vertically centred, anything taller than the sheet is cropped and any
 * shortfall leaves blank paper. The sheet is drawn at the real print-area
 * aspect ratio for the chosen size, the frame lip (hidden edge) is shaded,
 * and DPI is computed from the uploaded pixels over the real print width.
 */
export default function GalleryFrame({ imageDataUrl, frame, size, printArea }: Props) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const area = printArea || size.printArea;
  const sheetW = area.widthIn * PX_PER_INCH;
  const moulding = FRAME_MOULDING_IN * PX_PER_INCH;

  // Image placement in inches on the sheet.
  const imgHeightIn = dims ? (area.widthIn * dims.h) / dims.w : area.heightIn;
  const dpi = dims ? Math.round(dims.w / area.widthIn) : null;
  const croppedIn = Math.max(0, imgHeightIn - area.heightIn);
  const blankIn = Math.max(0, area.heightIn - imgHeightIn);
  const lowRes = dpi !== null && dpi < MIN_PRINT_DPI;

  const fmt = (n: number) => n.toFixed(1).replace(/\.0$/, "");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>
      <svg width="120" height="34" viewBox="0 0 120 34" aria-hidden style={{ opacity: 0.5 }}>
        <path d="M10 0 L60 30 L110 0" stroke="var(--ink-soft)" strokeWidth="1" fill="none" />
        <circle cx="10" cy="0" r="2" fill="var(--ink-soft)" />
        <circle cx="110" cy="0" r="2" fill="var(--ink-soft)" />
      </svg>

      <div
        style={{
          padding: moulding,
          background: FRAME_COLOURS[frame],
          borderRadius: 2,
          boxShadow: "0 30px 70px -20px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06)",
          maxWidth: "100%",
        }}
      >
        <div
          data-testid="print-sheet"
          style={{
            position: "relative",
            width: sheetW,
            maxWidth: "100%",
            aspectRatio: `${area.widthPx} / ${area.heightPx}`,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          <img
            src={imageDataUrl}
            alt="Your artwork as it will print on the sheet"
            style={{
              position: "absolute",
              left: 0,
              width: "100%",
              height: "auto",
              top: "50%",
              transform: "translateY(-50%)",
              display: "block",
            }}
          />
          {/* Safe area; everything outside it (the 0.25" frame lip) is shaded. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: `${(FRAME_LIP_IN / area.widthIn) * 100}%`,
              right: `${(FRAME_LIP_IN / area.widthIn) * 100}%`,
              top: `${(FRAME_LIP_IN / area.heightIn) * 100}%`,
              bottom: `${(FRAME_LIP_IN / area.heightIn) * 100}%`,
              outline: "1px dashed rgba(255,255,255,0.9)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)", textAlign: "center", lineHeight: 1.6 }}>
        <div>
          Print area {area.widthIn}" × {area.heightIn}" ({area.widthPx} × {area.heightPx}px @300dpi) · shown to scale
        </div>
        <div>Shaded edge ({FRAME_LIP_IN}") is hidden by the frame · keep key content inside the dashed line</div>
        {dims && croppedIn > 0.05 && (
          <div>
            {fmt(croppedIn)}" of your image will be cropped ({fmt(croppedIn / 2)}" top and bottom)
          </div>
        )}
        {dims && blankIn > 0.05 && (
          <div>
            Your image is wider than {size.inches}: {fmt(blankIn / 2)}" blank paper top and bottom
          </div>
        )}
        {dpi !== null && (
          <div
            role={lowRes ? "alert" : undefined}
            style={{ color: lowRes ? "#b3261e" : undefined, fontWeight: lowRes ? 600 : undefined }}
          >
            {lowRes
              ? `Low resolution: ~${dpi} DPI at ${size.inches} (needs ${MIN_PRINT_DPI}+). Expect a soft/pixelated print — choose a smaller size or a larger image.`
              : `Resolution: ~${dpi} DPI at ${size.inches}`}
          </div>
        )}
      </div>
    </div>
  );
}
