// Sanity check: generated model has true physical size. Run: npx tsx scripts/check-frame-model.ts
(globalThis as any).FileReader ??= class { result: any; onloadend: any; readAsArrayBuffer(b: Blob) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); } readAsDataURL(b: Blob) { b.arrayBuffer().then((r) => { this.result = "data:application/octet-stream;base64," + Buffer.from(r).toString("base64"); this.onloadend?.(); }); } };
import * as THREE from "three";
import { buildFrameScene, frameOuterSizeM, FRAME_DEPTH_M } from "../src/lib/frameModel";
import { SIZE_OPTIONS } from "../src/types";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
let ok = true;
for (const s of SIZE_OPTIONS) {
  const scene = buildFrameScene(s.printArea, "walnut");
  const box = new THREE.Box3().setFromObject(scene); const v = box.getSize(new THREE.Vector3());
  const exp = frameOuterSizeM(s.printArea);
  const good = Math.abs(v.x - exp.width) < 1e-6 && Math.abs(v.y - exp.height) < 1e-6 && Math.abs(box.min.z) < 1e-9 && Math.abs(box.max.z - FRAME_DEPTH_M) < 1e-9; // GLB: upright XY, back on wall at z=0, front +Z
  ok &&= good;
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  const magic = new TextDecoder().decode(new Uint8Array(glb, 0, 4));
  ok &&= magic === "glTF";
  console.log(s.id, `${(v.x * 100).toFixed(1)}cm x ${(v.y * 100).toFixed(1)}cm x ${(v.z * 100).toFixed(1)}cm`, magic, glb.byteLength + "B", good ? "OK" : "FAIL");
}
if (!ok) process.exit(1);
// --- USDZ (iOS Quick Look) inspection --------------------------------------
// Minimal canvas polyfill so USDZExporter can embed a texture under node.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
class FakeCanvas { width = 1; height = 1; getContext() { return { translate() {}, scale() {}, drawImage() {}, fillRect() {} }; } toBlob(cb: (b: Blob) => void) { cb(new Blob([PNG_1PX], { type: "image/png" })); } }
(globalThis as any).HTMLCanvasElement = FakeCanvas;
(globalThis as any).document = { createElement: () => new FakeCanvas() };
{
  const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js");
  const { unzipSync, strFromU8 } = await import("three/examples/jsm/libs/fflate.module.js");
  const s = SIZE_OPTIONS[1];
  const tex = new THREE.Texture(new FakeCanvas() as any);
  const scene = buildFrameScene(s.printArea, "black", tex, "quicklook");
  const u = await new USDZExporter().parseAsync(scene, { ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "vertical" } }, quickLookCompatible: true } as any);
  const files = unzipSync(u as Uint8Array);
  const usda = strFromU8(files["model.usda"]);
  const fail = (m: string) => { console.log("usdz FAIL:", m); ok = false; };
  if (!usda.includes('planeAnchoring:alignment = "vertical"')) fail("not vertical-anchored");
  if (!usda.includes('upAxis = "Y"')) fail("not Y-up");
  const pngs = Object.keys(files).filter((f) => /^textures\/.*\.png$/.test(f));
  if (!pngs.length) fail("no texture embedded");
  for (const p of pngs) if (!usda.includes(`@${p}@`)) fail(`texture ${p} not referenced`);
  // Each frame bar must sit at its edge: read its points from the referenced geometry file.
  const outer = frameOuterSizeM(s.printArea);
  const blocks = usda.split(/def Xform "/).slice(1);
  const bounds: Record<string, { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }> = {};
  for (const b of blocks) {
    const name = b.slice(0, b.indexOf('"'));
    const ref = b.match(/references = @\.\/(geometries\/[^@]+)@/);
    if (!ref) continue;
    const g = strFromU8(files[ref[1]]);
    const pts = [...g.match(/point3f\[\] points = \[([^\]]*)\]/)![1].matchAll(/\(([^)]*)\)/g)].map((m) => m[1].split(",").map(Number));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), zs = pts.map((p) => p[2]);
    bounds[name] = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-4;
  // Quick Look orientation: print lies in XZ, front faces +Y (out of the wall), top towards -Z.
  if (!bounds.FrameTop || !near(bounds.FrameTop.minZ, -outer.height / 2)) fail("FrameTop not at -Z edge (top)");
  if (!bounds.FrameBottom || !near(bounds.FrameBottom.maxZ, outer.height / 2)) fail("FrameBottom not at +Z edge");
  if (!bounds.FrameLeft || !near(bounds.FrameLeft.minX, -outer.width / 2)) fail("FrameLeft not at left edge");
  if (!bounds.FrameRight || !near(bounds.FrameRight.maxX, outer.width / 2)) fail("FrameRight not at right edge");
  if (!bounds.Print || !(bounds.Print.minY > bounds.Backing.maxY)) fail("print not in front (+Y) of backing");
  const allMinY = Math.min(...Object.values(bounds).map((b) => b.minY)), allMaxY = Math.max(...Object.values(bounds).map((b) => b.maxY));
  if (!near(allMinY, 0) || !near(allMaxY, FRAME_DEPTH_M)) fail(`thickness not along +Y from wall (y ${allMinY}..${allMaxY})`);
  if (!usda.match(/xformOp:transform = \(\s*\(1, 0, 0, 0\), \(0, 1, 0, 0\), \(0, 0, 1, 0\)/)) fail("unexpected rotation (model must stay upright, front +Z)");
  console.log("usdz", (u as Uint8Array).byteLength + "B", "textures:", pngs.join(","), JSON.stringify(Object.fromEntries(Object.entries(bounds).map(([k, v]) => [k, [v.minX, v.maxX, v.minY, v.maxY, v.minZ, v.maxZ].map((n) => +n.toFixed(3))]))));
}
if (!ok) process.exit(1);
console.log("ALL OK");
