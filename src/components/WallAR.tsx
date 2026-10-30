import { createElement, useEffect, useRef, useState } from "react";
import type { FrameFinish, SizeOption } from "../types";
import type { PrintArea } from "../providers";

interface Props {
  imageDataUrl: string;
  frame: FrameFinish;
  size: SizeOption;
  printArea?: PrintArea;
  onClose: () => void;
  onFallback: () => void; // open the live-camera overlay instead
}

type Status = "building" | "ready" | "unsupported" | "error";

export default function WallAR({ imageDataUrl, frame, size, printArea, onClose, onFallback }: Props) {
  const [status, setStatus] = useState<Status>("building");
  const [urls, setUrls] = useState<{ glb: string; usdz: string } | null>(null);
  const [arFailed, setArFailed] = useState(false);
  const mvRef = useRef<any>(null);
  const area = printArea ?? size.printArea;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      try {
        const [, lib] = await Promise.all([import("@google/model-viewer"), import("../lib/frameModel")]);
        const tex = await lib.loadPrintTexture(imageDataUrl, area);
        const scene = lib.buildFrameScene(area, frame, tex);
        const [glb, usdz] = await Promise.all([lib.exportGLB(scene), lib.exportUSDZ(scene)]);
        if (cancelled) return;
        const g = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
        const u = URL.createObjectURL(new Blob([usdz], { type: "model/vnd.usdz+zip" }));
        made.push(g, u);
        setUrls({ glb: g, usdz: u });
        setStatus("ready");
      } catch (e) {
        console.error("Wall AR model build failed", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [imageDataUrl, frame, area.widthIn, area.heightIn]);

  // After the model loads, ask model-viewer whether AR can actually launch here.
  useEffect(() => {
    const mv = mvRef.current;
    if (!mv || !urls) return;
    const onLoad = () => { if (!mv.canActivateAR) setStatus("unsupported"); };
    const onAr = (e: any) => { if (e.detail?.status === "failed") setArFailed(true); };
    mv.addEventListener("load", onLoad);
    mv.addEventListener("ar-status", onAr);
    return () => { mv.removeEventListener("load", onLoad); mv.removeEventListener("ar-status", onAr); };
  }, [urls]);

  const btn = (primary: boolean): React.CSSProperties => ({
    background: primary ? "var(--ink, #111)" : "var(--paper, #fff)",
    color: primary ? "var(--paper, #fff)" : "var(--ink, #111)",
    border: "1px solid var(--wall-shadow, #ccc)",
    padding: "12px 18px", borderRadius: 2, fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
  });
  const cm = (n: number) => Math.round(n * 2.54 + 1.905 * 2);

  return (
    <div role="dialog" aria-label="View in AR on your wall"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,18,16,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 14, color: "#fff" }}>
      <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 12, right: 14, background: "none", border: 0, color: "#fff", fontSize: 28 }}>×</button>
      <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 22, textAlign: "center" }}>View in AR on your wall</h2>
      <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, opacity: 0.75, textAlign: "center" }}>
        {size.label} {size.inches} · {frame} frame · true size ≈ {cm(area.widthIn)} × {cm(area.heightIn)} cm
      </p>

      {status === "building" && <p style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>building your 3D print…</p>}
      {status === "error" && (
        <>
          <p style={{ maxWidth: 340, textAlign: "center", fontSize: 14 }}>Couldn't build the 3D model on this device.</p>
          <button style={btn(true)} onClick={onFallback}>Use the camera preview instead →</button>
        </>
      )}

      {urls && status !== "error" && (
        <>
          {createElement(
            "model-viewer",
            {
              ref: mvRef,
              src: urls.glb,
              "ios-src": urls.usdz,
              alt: "Your framed print",
              ar: true,
              "ar-modes": "webxr scene-viewer quick-look",
              "ar-placement": "wall",
              "ar-scale": "fixed",
              "camera-controls": true,
              "touch-action": "pan-y",
              "shadow-intensity": "1",
              exposure: "1",
              style: { width: "min(90vw, 420px)", height: "min(55vh, 420px)", background: "#e9e5dd", borderRadius: 4 },
            },
            createElement("button", { slot: "ar-button", style: { ...btn(true), position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" } }, "📱 Place on my wall"),
          )}
          {status === "unsupported" || arFailed ? (
            <>
              <p style={{ maxWidth: 360, textAlign: "center", fontSize: 14, margin: 0 }}>
                {arFailed ? "AR couldn't start on this device." : "Wall AR isn't supported on this device or browser"}
                {" "}(needs Chrome on an ARCore Android phone, or Safari on iPhone/iPad). You can still spin the 3D model above.
              </p>
              <button style={btn(true)} onClick={onFallback}>Use the camera preview instead →</button>
            </>
          ) : (
            <>
              <p style={{ maxWidth: 360, textAlign: "center", fontSize: 14, margin: 0, lineHeight: 1.45 }}>
                Tap <b>Place on my wall</b>, point your phone at your wall and move it slowly side to side until the
                print snaps onto it. {isIOS ? "Drag to slide it along the wall." : "Drag to move it; it stays at real size."}
              </p>
              <button style={{ ...btn(false), background: "transparent", color: "#fff", fontSize: 12 }} onClick={onFallback}>
                Not working? Use the simple camera preview
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
