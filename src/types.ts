export type FrameFinish = "walnut" | "black" | "white";

export interface SizeOption {
  id: string;
  label: string;
  inches: string;
  // Real Printify variant_id per frame color, from blueprint 540
  // ("Framed Vertical Poster"), print provider 99 ("Printify Choice").
  variantIdByFrame: Record<FrameFinish, number>;
  // Printify print area for this variant (blueprint 540 / provider 99):
  // the full poster sheet at 300 DPI. Source: Printify recommended pixel
  // dimensions (https://printify.com/blog/art-print-sizes/) — width × height.
  printArea: { widthIn: number; heightIn: number; widthPx: number; heightPx: number };
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
    printArea: { widthIn: 11, heightIn: 14, widthPx: 3300, heightPx: 4200 },
  },
  {
    id: "16x20",
    label: "Medium",
    inches: '16" × 20"',
    variantIdByFrame: { black: 69667, walnut: 69674, white: 69681 },
    printArea: { widthIn: 16, heightIn: 20, widthPx: 4800, heightPx: 6000 },
  },
  {
    id: "20x30",
    label: "Large",
    inches: '20" × 30"',
    variantIdByFrame: { black: 69669, walnut: 69676, white: 69683 },
    printArea: { widthIn: 20, heightIn: 30, widthPx: 6000, heightPx: 9000 },
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

// The frame's rabbet/lip covers ~0.25" on every edge of the sheet (Printify
// lists an 11x14 mat opening as 10.5" x 13.5"). Keep important content inside.
export const FRAME_LIP_IN = 0.25;
// Below this effective resolution at print size we warn the customer.
export const MIN_PRINT_DPI = 150;
