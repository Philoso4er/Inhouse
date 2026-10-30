// Builds a true-to-size 3D model of a framed print (metres, glTF/USDZ units)
// for wall AR. Front of the print faces +Z; back sits at z=0 against the wall.
import * as THREE from "three";
import type { FrameFinish } from "../types";

export const INCH = 0.0254;
export const MOULDING_IN = 0.75; // matches CameraPlacer / GalleryFrame
export const FRAME_DEPTH_M = 0.022;
const FRAME_COLOURS: Record<FrameFinish, number> = { walnut: 0x4a3526, black: 0x151515, white: 0xf2f0ea };

export interface PrintSize { widthIn: number; heightIn: number }

export function frameOuterSizeM(p: PrintSize) {
  return { width: (p.widthIn + 2 * MOULDING_IN) * INCH, height: (p.heightIn + 2 * MOULDING_IN) * INCH, depth: FRAME_DEPTH_M };
}

export function buildFrameScene(p: PrintSize, frame: FrameFinish, texture?: THREE.Texture): THREE.Scene {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = "FramedPrint";
  const w = p.widthIn * INCH, h = p.heightIn * INCH, m = MOULDING_IN * INCH, d = FRAME_DEPTH_M;
  const frameMat = new THREE.MeshStandardMaterial({ color: FRAME_COLOURS[frame], roughness: 0.6, metalness: 0 });
  frameMat.name = "Frame";
  const bar = (bw: number, bh: number, x: number, y: number, name: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), frameMat);
    mesh.position.set(x, y, d / 2);
    mesh.name = name;
    group.add(mesh);
  };
  bar(w + 2 * m, m, 0, h / 2 + m / 2, "FrameTop");
  bar(w + 2 * m, m, 0, -h / 2 - m / 2, "FrameBottom");
  bar(m, h, -w / 2 - m / 2, 0, "FrameLeft");
  bar(m, h, w / 2 + m / 2, 0, "FrameRight");
  // Backing board
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 1 }));
  back.position.set(0, 0, 0.002);
  back.name = "Backing";
  group.add(back);
  // The print, slightly recessed behind the moulding face
  const printMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, map: texture ?? null });
  printMat.name = "Print";
  const print = new THREE.Mesh(new THREE.PlaneGeometry(w, h), printMat);
  print.position.set(0, 0, d - 0.006);
  print.name = "Print";
  group.add(print);
  scene.add(group);
  return scene;
}

/** Load the user's image into a texture, cropped (cover) to the print aspect and capped in size. */
export async function loadPrintTexture(imageDataUrl: string, p: PrintSize, maxPx = 2048): Promise<THREE.Texture> {
  const img = new Image();
  img.src = imageDataUrl;
  await img.decode();
  const aspect = p.widthIn / p.heightIn;
  const cw = aspect >= 1 ? maxPx : Math.round(maxPx * aspect);
  const ch = aspect >= 1 ? Math.round(maxPx / aspect) : maxPx;
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function exportGLB(scene: THREE.Scene): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  return (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
}

export async function exportUSDZ(scene: THREE.Scene): Promise<ArrayBuffer> {
  const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js");
  const data = await new USDZExporter().parseAsync(scene, {
    ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "vertical" } },
    quickLookCompatible: true,
    maxTextureSize: 2048,
  } as any);
  return (data as Uint8Array).buffer as ArrayBuffer;
}
