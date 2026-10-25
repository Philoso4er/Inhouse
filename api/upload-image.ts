import type { VercelRequest, VercelResponse } from "@vercel/node";
import { uploadImageToPrintify } from "../lib/printify.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { fileName, dataUrl } = req.body as { fileName: string; dataUrl: string };
    if (!fileName || !dataUrl) {
      res.status(400).json({ error: "Missing fileName or dataUrl" });
      return;
    }

    if (!process.env.PRINTIFY_API_TOKEN) {
      console.error("upload-image: PRINTIFY_API_TOKEN is not set for this environment");
      res.status(503).json({ error: "Image uploads aren't configured on this deployment (print service key missing)." });
      return;
    }
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const result = await uploadImageToPrintify(fileName, base64);
    res.status(200).json({ imageUrl: result.preview_url });
  } catch (err: any) {
    console.error("upload-image error:", err);
    res.status(502).json({ error: "The print service rejected the image upload. Please try again." });
  }
}
