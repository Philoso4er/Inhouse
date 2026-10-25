import { useEffect, useRef, useState } from "react";
import type { FrameFinish, SizeOption } from "../types";
import type { PrintArea } from "../providers";

interface Props {
  imageDataUrl: string;
  frame: FrameFinish;
  size: SizeOption;
  printArea?: PrintArea;
  onClose: () => void;
}

interface Transform {
  x: number; // centre, px in the container
  y: number;
  scale: number;
  rotation: number; // radians
}

const FRAME_COLOURS: Record<FrameFinish, string> = { walnut: "#4a3526", black: "#151515", white: "#f2f0ea" };
const MOULDING_IN = 0.75;
const BASE_W = 170; // on-screen width of the frame at scale 1

function cameraError(e: any): string {
  if (!window.isSecureContext) return "The camera needs a secure (https) connection. Open the site via its https:// address.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't open the camera. Try Chrome on Android or Safari on iPhone.";
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was blocked. Allow camera access for this site in your browser settings (tap the lock/ⓘ icon by the address bar), then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is being used by another app. Close it and try again.";
    default:
      return "Couldn't start the camera. Please try again.";
  }
}

export default function CameraPlacer({ imageDataUrl, frame, size, printArea, onClose }: Props) {
  const area = printArea || size.printArea;
  const outerW = area.widthIn + 2 * MOULDING_IN;
  const outerH = area.heightIn + 2 * MOULDING_IN;
  const frameW = BASE_W;
  const frameH = (BASE_W * outerH) / outerW; // true aspect ratio, always
  const moulding = (MOULDING_IN / outerW) * BASE_W;

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const tRef = useRef(t);
  tRef.current = t;

  // Active pointers + gesture baseline.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<{ t: Transform; cx: number; cy: number; dist: number; angle: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = imageDataUrl;
    artRef.current = img;
  }, [imageDataUrl]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setReady(true);
        requestAnimationFrame(() => {
          const r = containerRef.current?.getBoundingClientRect();
          if (r) setT((p) => ({ ...p, x: r.width / 2, y: r.height / 2 }));
        });
      } catch (e) {
        if (!cancelled) setError(cameraError(e));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [attempt]);

  function snapshot() {
    const pts = [...pointers.current.values()];
    if (!pts.length) {
      base.current = null;
      return;
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let dist = 0, angle = 0;
    if (pts.length >= 2) {
      dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    }
    base.current = { t: tRef.current, cx, cy, dist, angle };
  }

  function onDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    snapshot();
  }
  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !base.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const b = base.current;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const next = { ...b.t, x: b.t.x + cx - b.cx, y: b.t.y + cy - b.cy };
    if (pts.length >= 2 && b.dist > 0) {
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      next.scale = Math.max(0.2, Math.min(6, b.t.scale * (dist / b.dist)));
      next.rotation = b.t.rotation + (angle - b.angle);
    }
    setT(next);
  }
  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    snapshot(); // re-baseline so lifting one finger doesn't jump
  }
  function onWheel(e: React.WheelEvent) {
    // Desktop convenience: wheel resizes, shift+wheel rotates.
    setT((p) =>
      e.shiftKey
        ? { ...p, rotation: p.rotation + e.deltaY / 500 }
        : { ...p, scale: Math.max(0.2, Math.min(6, p.scale * (1 - e.deltaY / 1000))) }
    );
  }

  async function capture() {
    const v = videoRef.current, c = containerRef.current, art = artRef.current;
    if (!v || !c || !art) return;
    const W = c.clientWidth, H = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    // Video drawn with object-fit: cover.
    const s = Math.max(W / v.videoWidth, H / v.videoHeight);
    ctx.drawImage(v, (W - v.videoWidth * s) / 2, (H - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rotation);
    ctx.scale(t.scale, t.scale);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = FRAME_COLOURS[frame];
    ctx.fillRect(-frameW / 2, -frameH / 2, frameW, frameH);
    ctx.shadowColor = "transparent";
    const iw = frameW - 2 * moulding, ih = frameH - 2 * moulding;
    ctx.fillStyle = "#fafaf7";
    ctx.fillRect(-iw / 2, -ih / 2, iw, ih);
    ctx.beginPath();
    ctx.rect(-iw / 2, -ih / 2, iw, ih);
    ctx.clip();
    const ah = (iw * art.naturalHeight) / art.naturalWidth;
    ctx.drawImage(art, -iw / 2, -ah / 2, iw, ah);
    ctx.restore();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return;
    const file = new File([blob], "inhouse-on-my-wall.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "InHouse preview" });
        return;
      } catch {
        /* fall through to download */
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const btn: React.CSSProperties = {
    background: "none", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", padding: "10px 16px",
    minHeight: 44, borderRadius: 2, fontFamily: "inherit", fontSize: 12, letterSpacing: "0.05em", textTransform: "uppercase",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 1000, display: "flex", flexDirection: "column" }}>
      <div ref={containerRef} onWheel={onWheel} style={{ position: "relative", flex: 1, overflow: "hidden", touchAction: "none" }}>
        <video ref={videoRef} playsInline muted autoPlay style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />

        {ready && !error && (
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{
              position: "absolute", left: t.x, top: t.y, width: frameW, height: frameH,
              transform: `translate(-50%, -50%) rotate(${t.rotation}rad) scale(${t.scale})`,
              boxSizing: "border-box", border: `${moulding}px solid ${FRAME_COLOURS[frame]}`,
              background: `#fafaf7 url(${imageDataUrl}) center / 100% auto no-repeat`,
              boxShadow: "0 14px 30px -8px rgba(0,0,0,0.55), inset 0 0 3px rgba(0,0,0,0.35)",
              touchAction: "none", cursor: "grab", userSelect: "none", WebkitUserSelect: "none",
            }}
            aria-label="Your framed artwork — drag to move, pinch to resize, twist to rotate"
          />
        )}

        {!ready && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--font-body, sans-serif)" }}>
            Starting camera…
          </div>
        )}

        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 16, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#fff", fontFamily: "var(--font-body, sans-serif)" }}>
            <span>{error}</span>
            <button style={btn} onClick={() => setAttempt((a) => a + 1)}>Try again</button>
          </div>
        )}
      </div>

      <div style={{ padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "#111", color: "#fff", display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
        <span style={{ opacity: 0.6 }}>drag · pinch to resize · twist to rotate</span>
        <span style={{ display: "flex", gap: 8 }}>
          {ready && !error && <button style={btn} onClick={capture}>Capture</button>}
          <button style={btn} onClick={onClose}>Done</button>
        </span>
      </div>
    </div>
  );
}
