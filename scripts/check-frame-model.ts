// Sanity check: generated model has true physical size. Run: npx tsx scripts/check-frame-model.ts
(globalThis as any).FileReader ??= class { result: any; onloadend: any; readAsArrayBuffer(b: Blob) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); } readAsDataURL(b: Blob) { b.arrayBuffer().then((r) => { this.result = "data:application/octet-stream;base64," + Buffer.from(r).toString("base64"); this.onloadend?.(); }); } };
import * as THREE from "three";
import { buildFrameScene, frameOuterSizeM } from "../src/lib/frameModel";
import { SIZE_OPTIONS } from "../src/types";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
let ok = true;
for (const s of SIZE_OPTIONS) {
  const scene = buildFrameScene(s.printArea, "walnut");
  const box = new THREE.Box3().setFromObject(scene); const v = box.getSize(new THREE.Vector3());
  const exp = frameOuterSizeM(s.printArea);
  const good = Math.abs(v.x - exp.width) < 1e-6 && Math.abs(v.y - exp.height) < 1e-6 && box.min.z >= -1e-9;
  ok &&= good;
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  const magic = new TextDecoder().decode(new Uint8Array(glb, 0, 4));
  ok &&= magic === "glTF";
  console.log(s.id, `${(v.x * 100).toFixed(1)}cm x ${(v.y * 100).toFixed(1)}cm x ${(v.z * 100).toFixed(1)}cm`, magic, glb.byteLength + "B", good ? "OK" : "FAIL");
}
if (!ok) process.exit(1);
{
  const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js");
  const u = await new USDZExporter().parseAsync(buildFrameScene(SIZE_OPTIONS[1].printArea, "black"), { ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: "vertical" } }, quickLookCompatible: true } as any);
  const txt = new TextDecoder().decode(u as Uint8Array);
  const vertical = txt.includes('planeAnchoring:alignment = "vertical"');
  console.log("usdz", (u as Uint8Array).byteLength + "B", vertical ? "vertical-anchored OK" : "FAIL");
  if (!vertical) process.exit(1);
}
