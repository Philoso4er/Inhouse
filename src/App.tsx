import { useEffect, useMemo, useState } from "react";
import Uploader from "./components/Uploader";
import GalleryFrame from "./components/GalleryFrame";
import Configurator from "./components/Configurator";
import Placard from "./components/Placard";
import CameraPlacer from "./components/CameraPlacer";
import { SIZE_OPTIONS, type FrameFinish } from "./types";

export default function App() {
  const justPaid = useMemo(
    () => new URLSearchParams(window.location.search).get("success") === "true",
    []
  );
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sizeId, setSizeId] = useState(SIZE_OPTIONS[1].id);
  const [frame, setFrame] = useState<FrameFinish>("walnut");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const size = useMemo(() => SIZE_OPTIONS.find((s) => s.id === sizeId)!, [sizeId]);
  const variantId = size.variantIdByFrame[frame];

  useEffect(() => {
    let cancelled = false;
    setPriceLoading(true);
    setPriceCents(null);
    fetch(`/api/get-price?variantId=${variantId}`)
      .then((res) => {
        if (!res.ok) throw new Error("price fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPriceCents(data.priceCents);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load live pricing — try again.");
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  async function handleImage(dataUrl: string, file: File) {
    setImageDataUrl(dataUrl);
    setImageUrl(null);
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, dataUrl }),
      });
      if (!res.ok) throw new Error("Upload failed");
      const { imageUrl } = await res.json();
      setImageUrl(imageUrl);
    } catch (e) {
      setError("Couldn't upload that image — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCheckout() {
    if (!imageUrl) return;
    setCheckoutLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          variantId,
          sizeLabel: `${size.label} (${size.inches}) — ${frame}`,
        }),
      });
      if (!res.ok) throw new Error("Checkout failed");
      const { url } = await res.json();
      window.location.href = url;
    } catch (e) {
      setError("Couldn't start checkout — try again in a moment.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", padding: "0 20px" }}>
      <header
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 0 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>
          InHouse
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            opacity: 0.6,
          }}
        >
          your art, printed and framed
        </span>
      </header>

      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 56,
          padding: "40px 0 80px",
        }}
      >
        {justPaid ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--brass)",
                marginBottom: 12,
              }}
            >
              order placed
            </p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "0 0 12px" }}>
              It's on its way to the printer.
            </h1>
            <p style={{ fontFamily: "var(--font-body)", color: "var(--ink-soft)", marginBottom: 28 }}>
              You'll get a shipping confirmation by email once it's printed and boxed.
            </p>
            <button
              onClick={() => {
                window.history.replaceState({}, "", "/");
                setImageDataUrl(null);
                setImageUrl(null);
                window.location.reload();
              }}
              style={{
                padding: "12px 24px",
                background: "var(--ink)",
                color: "var(--paper)",
                border: "none",
                borderRadius: 2,
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Order another print
            </button>
          </div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px, 360px)", gap: 56 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            {imageDataUrl ? (
              <GalleryFrame imageDataUrl={imageDataUrl} frame={frame} />
            ) : (
              <div style={{ maxWidth: 340, width: "100%" }}>
                <Uploader onImage={handleImage} />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 500,
                  fontSize: 30,
                  lineHeight: 1.15,
                  margin: "0 0 10px",
                }}
              >
                Put your own work
                <br />
                on the wall.
              </h1>
              <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--ink-soft)", margin: 0 }}>
                Upload a photo or piece of art. Choose a size and frame. We print it, frame it, and
                ship it — you don't touch a printer.
              </p>
            </div>

            {imageDataUrl && (
              <>
                <Configurator
                  sizeId={sizeId}
                  frame={frame}
                  onSizeChange={setSizeId}
                  onFrameChange={setFrame}
                />
                <Placard
                  orderNumber={1}
                  sizeLabel={size.label}
                  sizeInches={size.inches}
                  frameLabel={`${frame[0].toUpperCase()}${frame.slice(1)} frame`}
                  priceCents={priceCents}
                  priceLoading={priceLoading}
                  loading={checkoutLoading}
                  disabled={uploading || !imageUrl || priceCents === null}
                  onCheckout={handleCheckout}
                  error={error}
                />
                {uploading && (
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>
                    preparing your image…
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                  <button
                    onClick={() => setShowCamera(true)}
                    style={{
                      background: "var(--paper)",
                      border: "1px solid var(--wall-shadow)",
                      padding: "10px 16px",
                      borderRadius: 2,
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink)",
                    }}
                  >
                    See it on your wall →
                  </button>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--ink-soft)",
                      opacity: 0.55,
                    }}
                  >
                    live camera preview · true room-anchored AR coming as a premium feature
                  </p>
                  <button
                    onClick={() => {
                      setImageDataUrl(null);
                      setImageUrl(null);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-soft)",
                      textDecoration: "underline",
                      opacity: 0.7,
                    }}
                  >
                    choose a different image
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </main>

      {showCamera && imageDataUrl && (
        <CameraPlacer imageDataUrl={imageDataUrl} frame={frame} onClose={() => setShowCamera(false)} />
      )}

      <style>{`
        @media (max-width: 760px) {
          main > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
