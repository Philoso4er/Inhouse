import { useCallback, useRef, useState } from "react";

interface Props {
  onImage: (dataUrl: string, file: File) => void;
}

// Vercel's serverless functions have a hard ~4.5MB request body limit that
// can't be raised by app config. A high-res photo, once base64-encoded
// (~33% larger than the raw file), can easily exceed that. Resize down to a
// sensible max dimension before upload — still plenty sharp for a framed
// print at normal viewing distance, and keeps the payload well under the
// limit for virtually any photo.
const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.88;

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.onerror = () => reject(new Error("Could not read that image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
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
        const dataUrl = await resizeImage(file);
        onImage(dataUrl, file);
      } catch {
        // Fall back to the original file if resizing fails for any reason
        // (e.g. an unusual format) — better to attempt the real upload than
        // block the user entirely.
        const reader = new FileReader();
        reader.onload = () => onImage(reader.result as string, file);
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
