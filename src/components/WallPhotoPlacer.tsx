import { useEffect, useRef, useState } from "react";
import type { FrameFinish, SizeOption } from "../types";
import type { PrintArea } from "../providers";

interface Props {
  imageDataUrl: string;
  frame: FrameFinish;
  size: SizeOption;
  printArea?: PrintArea;
  onClose: () => void;
  onLiveCamera: () => void;
}

type Pt = { x: number; y: number }; // normalised 0..1 over the photo

const FRAME_COLOURS: Record<FrameFinish, string> = { walnut: "#4a3526", black: "#151515", white: "#f2f0ea" };
const MOULDING_IN = 0.75;
const MAX_PHOTO_PX = 1600;

/** CSS matrix3d mapping a w×h box onto quad p (TL, TR, BR, BL). */
function quadMatrix(w: number, h: number, p: Pt[]): string {
  const [p0, p1, p2, p3] = p;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, hh = 0;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) > 1e-9 && (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9)) {
    g = (dx3 * dy2 - dx2 * dy3) / det;
    hh = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + hh * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + hh * p3.y, f = p0.y;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => (Number.isFinite(v) ? v : 0)).join(",")})`;
}

/** Downscale + re-encode so huge phone photos (and EXIF rotation) behave on iOS/Android. */
function loadPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, MAX_PHOTO_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * s);
      canvas.height = Math.round(img.naturalHeight * s);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo"));
    };
    img.src = url;
  });
}

export default function WallPhotoPlacer({ imageDataUrl, frame, size, printArea, onClose, onLiveCamera }: Props) {
  const area = printArea || size.printArea;
  const outerW = area.widthIn + 2 * MOULDING_IN;
  const outerH = area.heightIn + 2 * MOULDING_IN;

  const [photo, setPhoto] = useState<string | null>(null);
  const [photoAspect, setPhotoAspect] = useState(4 / 3); // h / w
  const [error, setError] = useState<string | null>(null);
  const [pts, setPts] = useState<Pt[] | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ idx: number; id: number } | null>(null);
  const takeRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLInputElement>(null);

  // Track the rendered photo size so normalised corners map to pixels.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [photo]);

  // Initial corners: an upright rectangle with the frame's real proportions.
  function resetCorners(aspectHW: number) {
    const wFrac = 0.4;
    const hFrac = Math.min(0.8, (wFrac * (outerH / outerW)) / aspectHW);
    const w = (hFrac * aspectHW * outerW) / outerH;
    const x0 = 0.5 - w / 2, y0 = 0.5 - hFrac / 2;
    setPts([
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + hFrac },
      { x: x0, y: y0 + hFrac },
    ]);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await loadPhoto(file);
      const img = new Image();
      img.onload = () => {
        const asp = img.naturalHeight / img.naturalWidth;
        setPhotoAspect(asp);
        setPhoto(dataUrl);
        resetCorners(asp);
      };
      img.src = dataUrl;
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Keep the quad's proportions in step if size changes while open.
  useEffect(() => {
    if (photo) resetCorners(photoAspect);
  }, [outerW, outerH]);

  function onDown(idx: number, e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { idx, id: e.pointerId };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const el = stageRef.current;
    if (!d || d.id !== e.pointerId || !el || !pts) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setPts(pts.map((p, i) => (i === d.idx ? { x, y } : p)));
  }
  function onUp() {
    drag.current = null;
  }

  // Render the framed artwork at a fixed base size, then warp it onto the quad.
  const BASE = 300;
  const baseW = BASE;
  const baseH = (BASE * outerH) / outerW;
  const moulding = (MOULDING_IN / outerW) * BASE;
  const pxPts = pts?.map((p) => ({ x: p.x * box.w, y: p.y * box.h }));

  const btn: React.CSSProperties = {
    padding: "12px 18px", minHeight: 44, borderRadius: 2, border: "1px solid #ccc",
    background: "#fff", color: "#111", fontWeight: 600, fontSize: 14,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#111", zIndex: 50, display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button style={btn} onClick={() => takeRef.current?.click()}>Take photo</button>
        <button style={btn} onClick={() => chooseRef.current?.click()}>Choose photo</button>
        <button style={{ ...btn, background: "transparent", color: "#fff" }} onClick={onLiveCamera}>Live camera</button>
        {photo && (
          <button style={{ ...btn, background: "transparent", color: "#fff" }} onClick={() => resetCorners(photoAspect)}>Reset</button>
        )}
        <button style={{ ...btn, marginLeft: "auto" }} onClick={onClose}>Done</button>
        <input ref={takeRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <input ref={chooseRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 12 }}>
        {!photo ? (
          <p style={{ maxWidth: 320, textAlign: "center", opacity: 0.8, fontSize: 14 }}>
            Take or choose a photo of your wall (straight on works best). Then drag the four corners to where the
            frame should hang. {size.inches} frame, shown to its real proportions.
            {error && <span style={{ display: "block", color: "#f88", marginTop: 8 }}>{error}</span>}
          </p>
        ) : (
          <div
            ref={stageRef}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{
              position: "relative",
              width: `min(100%, calc((100vh - 140px) / ${photoAspect}))`,
              aspectRatio: `1 / ${photoAspect}`,
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            <img src={photo} alt="Your wall" draggable={false} style={{ width: "100%", height: "100%", display: "block" }} />
            {pxPts && box.w > 0 && (
              <>
                <div
                  style={{
                    position: "absolute", left: 0, top: 0, width: baseW, height: baseH,
                    transformOrigin: "0 0", transform: quadMatrix(baseW, baseH, pxPts),
                    boxSizing: "border-box", border: `${moulding}px solid ${FRAME_COLOURS[frame]}`,
                    background: `#fafaf7 url(${imageDataUrl}) center / 100% auto no-repeat`,
                    boxShadow: "6px 10px 18px rgba(0,0,0,0.35), inset 0 0 4px rgba(0,0,0,0.35)",
                    pointerEvents: "none",
                  }}
                />
                {pxPts.map((p, i) => (
                  <div
                    key={i}
                    onPointerDown={(e) => onDown(i, e)}
                    aria-label={`corner ${i + 1}`}
                    style={{
                      position: "absolute", left: p.x - 22, top: p.y - 22, width: 44, height: 44,
                      borderRadius: "50%", touchAction: "none", cursor: "grab",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(255,255,255,0.9)", border: "2px solid #c8a15a", boxShadow: "0 1px 4px rgba(0,0,0,.5)" }} />
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
