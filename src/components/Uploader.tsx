import { useCallback, useRef, useState } from "react";

export interface SourceDims {
  w: number;
  h: number;
}

interface Props {
  onImage: (dataUrl: string, file: File, source: SourceDims) => void;
}

// Vercel serverless functions have a hard 4.5MB request body limit (not
// configurable). The image is sent base64 in JSON (~33% larger than the
// bytes), so we keep the encoded payload under ~3.4MB. We keep as many pixels
// as possible (up to the largest print area, 9000px) and step JPEG quality /
// dimensions down until it fits. The ORIGINAL pixel size is reported
// separately so the DPI estimate reflects the user's real file.
const MAX_DIMENSION = 9000;
const MAX_DATAURL_CHARS = 3_400_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = url;
  });
}

async function prepareImage(file: File): Promise<{ dataUrl: string; source: SourceDims }> {
  const img = await loadImage(file);
  const source = { w: img.naturalWidth, h: img.naturalHeight };
  let scale = Math.min(1, MAX_DIMENSION / Math.max(source.w, source.h));
  const qualities = [0.92, 0.85, 0.78];
  for (let attempt = 0; attempt < 12; attempt++) {
    const width = Math.max(1, Math.round(source.w * scale));
    const height = Math.max(1, Math.round(source.h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, width, height);
    for (const q of qualities) {
      const dataUrl = canvas.toDataURL("image/jpeg", q);
      // Some mobile browsers silently return "data:," for oversized canvases.
      if (dataUrl.length > 100 && dataUrl.length <= MAX_DATAURL_CHARS) return { dataUrl, source };
    }
    scale *= 0.8;
  }
  throw new Error("Image too large to prepare for upload");
}

export default function Uploader({ onImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      setProcessing(true);
      try {
        const { dataUrl, source } = await prepareImage(file);
        onImage(dataUrl, file, source);
      } catch {
        // Fall back to the original file if resizing fails (e.g. an unusual
        // format); the server reports clearly if it's too big.
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const img = new Image();
          img.onload = () => onImage(dataUrl, file, { w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => onImage(dataUrl, file, { w: 0, h: 0 });
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      } finally {
        setProcessing(false);
      }
    },
    [onImage]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload your artwork or photo"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      style={{
        width: "100%",
        aspectRatio: "4 / 5",
        border: `2px dashed ${dragging ? "var(--brass)" : "var(--wall-shadow)"}`,
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: dragging ? "rgba(156,122,60,0.06)" : "var(--paper)",
        boxShadow: "0 18px 40px -20px rgba(0,0,0,0.35)",
        transition: "border-color 160ms ease, background 160ms ease",
        cursor: "pointer",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <span style={{ fontSize: 34, opacity: 0.35 }}>+</span>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: 18,
          color: "var(--ink)",
          textAlign: "center",
        }}
      >
        {processing ? "Preparing your image…" : "Hang something here"}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-soft)",
          opacity: 0.6,
        }}
      >
        {processing ? "just a moment" : "drop an image, or click to browse"}
      </p>
    </div>
  );
}
