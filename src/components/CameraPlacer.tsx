import { useEffect, useRef, useState } from "react";
import type { FrameFinish } from "../types";

interface Props {
  imageDataUrl: string;
  frame: FrameFinish;
  onClose: () => void;
}

interface Transform {
  x: number; // center position, px, relative to video container
  y: number;
  scale: number;
  rotation: number; // degrees
}

const FRAME_BORDER: Record<FrameFinish, string> = {
  walnut: "#4a3526",
  black: "#151515",
  white: "#f2f0ea",
};

export default function CameraPlacer({ imageDataUrl, frame, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [t, setT] = useState<Transform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const dragState = useRef<{
    mode: "move" | "resize" | "rotate" | null;
    startX: number;
    startY: number;
    start: Transform;
  }>({ mode: null, startX: 0, startY: 0, start: t });

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        // Center the frame once the container has a size.
        requestAnimationFrame(() => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setT((prev) => ({ ...prev, x: rect.width / 2, y: rect.height / 2 }));
          }
        });
      } catch (e) {
        setError(
          "Couldn't access your camera. Check that this site has camera permission in your browser settings."
        );
      }
    })();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function onPointerDownFrame(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { mode: "move", startX: e.clientX, startY: e.clientY, start: t };
  }

  function onPointerDownResize(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { mode: "resize", startX: e.clientX, startY: e.clientY, start: t };
  }

  function onPointerDownRotate(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { mode: "rotate", startX: e.clientX, startY: e.clientY, start: t };
  }

  function onPointerMove(e: React.PointerEvent) {
    const { mode, startX, startY, start } = dragState.current;
    if (!mode) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (mode === "move") {
      setT({ ...start, x: start.x + dx, y: start.y + dy });
    } else if (mode === "resize") {
      const delta = (dx + dy) / 2;
      const nextScale = Math.max(0.3, Math.min(3, start.scale + delta / 150));
      setT({ ...start, scale: nextScale });
    } else if (mode === "rotate") {
      const nextRotation = start.rotation + dx / 2;
      setT({ ...start, rotation: nextRotation });
    }
  }

  function onPointerUp() {
    dragState.current.mode = null;
  }

  const frameWidth = 10;
  const matWidth = 12;
  const baseSize = 200;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ position: "relative", flex: 1, overflow: "hidden", touchAction: "none" }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        {ready && !error && (
          <div
            onPointerDown={onPointerDownFrame}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              width: baseSize,
              height: baseSize * 1.25,
              transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scale})`,
              padding: frameWidth,
              background: FRAME_BORDER[frame],
              boxShadow: "0 20px 45px -15px rgba(0,0,0,0.6)",
              cursor: "grab",
              touchAction: "none",
            }}
          >
            <div style={{ padding: matWidth, background: "#f7f5ef", height: "100%" }}>
              <img
                src={imageDataUrl}
                alt="Your artwork, positioned on your wall"
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>

            {/* resize handle */}
            <div
              onPointerDown={onPointerDownResize}
              style={{
                position: "absolute",
                right: -14,
                bottom: -14,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--brass, #9c7a3c)",
                border: "2px solid white",
                cursor: "nwse-resize",
                touchAction: "none",
              }}
            />

            {/* rotate handle */}
            <div
              onPointerDown={onPointerDownRotate}
              style={{
                position: "absolute",
                left: "50%",
                top: -34,
                transform: "translateX(-50%)",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "white",
                border: "2px solid var(--brass, #9c7a3c)",
                cursor: "grab",
                touchAction: "none",
              }}
            />
          </div>
        )}

        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              textAlign: "center",
              color: "white",
              fontFamily: "var(--font-body, sans-serif)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "16px 20px",
          background: "#111",
          color: "#fff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ opacity: 0.6 }}>drag to move · handle to resize · top dot to rotate</span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.4)",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: 2,
            fontFamily: "inherit",
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
