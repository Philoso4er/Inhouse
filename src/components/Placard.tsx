interface Props {
  orderNumber: number;
  sizeLabel: string;
  sizeInches: string;
  frameLabel: string;
  priceCents: number | null;
  currency?: string;
  priceLoading: boolean;
  loading: boolean;
  disabled: boolean;
  onCheckout: () => void;
  error?: string | null;
}

export default function Placard({
  orderNumber,
  sizeLabel,
  sizeInches,
  frameLabel,
  priceCents,
  currency = "gbp",
  priceLoading,
  loading,
  disabled,
  onCheckout,
  error,
}: Props) {
  const price =
    priceCents !== null
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(priceCents / 100)
      : null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--wall-shadow)",
        paddingTop: 18,
        marginTop: 4,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--brass)",
          marginBottom: 6,
        }}
      >
        No. {String(orderNumber).padStart(3, "0")}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          marginBottom: 4,
        }}
      >
        {sizeLabel} · {frameLabel}
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--ink-soft)",
          marginBottom: 18,
        }}
      >
        {sizeInches} print, made to order and shipped in 5–8 days.
      </div>

      <button
        onClick={onCheckout}
        disabled={disabled || loading}
        style={{
          width: "100%",
          padding: "14px 20px",
          background: disabled || loading ? "var(--wall-shadow)" : "var(--ink)",
          color: "var(--paper)",
          border: "none",
          borderRadius: 2,
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span>{loading ? "Preparing checkout…" : "Order this print"}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>
          {priceLoading || price === null ? "…" : price}
        </span>
      </button>

      {error && (
        <p style={{ color: "#a13a2f", fontSize: 12, marginTop: 10, fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
