export type FrameFinish = "walnut" | "black" | "white";

export interface SizeOption {
  id: string;
  label: string;
  inches: string;
  // Real Printify variant_id per frame color, from blueprint 540
  // ("Framed Vertical Poster"), print provider 99 ("Printify Choice").
  variantIdByFrame: Record<FrameFinish, number>;
  // Retail price is computed live from Printify's real cost + shipping +
  // margin (see lib/pricing.ts) — not stored here.
}

export const FRAME_FINISHES: { id: FrameFinish; label: string; swatch: string }[] = [
  { id: "walnut", label: "Walnut", swatch: "#4a3526" },
  { id: "black", label: "Black", swatch: "#151515" },
  { id: "white", label: "White", swatch: "#f2f0ea" },
];

export const SIZE_OPTIONS: SizeOption[] = [
  {
    id: "11x14",
    label: "Small",
    inches: '11" × 14"',
    variantIdByFrame: { black: 69663, walnut: 69670, white: 69677 },
  },
  {
    id: "16x20",
    label: "Medium",
    inches: '16" × 20"',
    variantIdByFrame: { black: 69667, walnut: 69674, white: 69681 },
  },
  {
    id: "20x30",
    label: "Large",
    inches: '20" × 30"',
    variantIdByFrame: { black: 69669, walnut: 69676, white: 69683 },
  },
];

export const PRINT_PROVIDER_ID = 99; // Printify Choice — auto-routes to best provider
export const BLUEPRINT_ID = 540; // Framed Vertical Poster

export interface OrderSelection {
  sizeId: string;
  frame: FrameFinish;
  imageUrl: string | null; // Printify-hosted image URL, set after upload — used directly in order print_areas
  imageDataUrl: string | null; // local preview only
}
