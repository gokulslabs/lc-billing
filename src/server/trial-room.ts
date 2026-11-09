import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { storeImage } from "@/lib/storefront";
import { trialOutfits, trialRoomApiPath } from "@/lib/trial-room";

const provider = "https://api.fashn.ai/v1";
const jpegPrefix = "data:image/jpeg;base64,";
const maxPhotoLength = 1_600_000;
const waitMs = 2_000;
const hour = 60 * 60 * 1000;
const jpegData = /^data:image\/jpeg;base64,\/[a-zA-Z0-9+/]+={0,2}$/;
const submissionSchema = z.object({
  outfitId: z.string().max(80),
  photo: z.string().max(maxPhotoLength).regex(jpegData),
  consent: z.literal(true),
});

const apiKey = () => process.env["FASHN_API_KEY"]?.trim();
const recentRuns: number[] = [];
let inFlight = 0;

export const trialRoomApi = new Hono();
trialRoomApi.use(trialRoomApiPath, async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});

trialRoomApi.get(trialRoomApiPath, (c) => c.json({ available: Boolean(apiKey()) }));

trialRoomApi.post(
  trialRoomApiPath,
  bodyLimit({
    maxSize: maxPhotoLength + 1_024,
    onError: (c) => c.json({ message: "That photo is too large. Try a smaller image." }, 413),
  }),
  async (c) => {
    const key = apiKey();
    if (!key)
      return c.json(
        { message: "Personal try-on is currently unavailable. You can still view the example." },
        503,
      );
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      return c.json({ message: "Open the Trial Room directly to create a preview." }, 403);
    }
    if (c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return c.json({ message: "Choose a valid photo to continue." }, 415);
    }

    const parsed = submissionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !readJpeg(parsed.data.photo)) {
      return c.json({ message: "Choose a valid photo and confirm you agree to the try-on." }, 400);
    }
    const outfit = trialOutfits.find((product) => product.id === parsed.data.outfitId);
    if (!outfit) return c.json({ message: "Choose an outfit from the Trial Room." }, 400);

    const now = Date.now();
    while (recentRuns.length && now - recentRuns[0]! >= hour) recentRuns.shift();
    if (inFlight >= 3 || recentRuns.length >= 24) {
      return c.json({ message: "The Trial Room is busy. Please try again later." }, 429);
    }

    inFlight++;
    recentRuns.push(now);
    const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(55_000)]);
    try {
      const reference = await catalogPhoto(outfit.category.image);
      const headers = { Authorization: `Bearer ${key}` };
      const response = await fetch(`${provider}/run`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model_name: "tryon-v1.6",
          inputs: {
            model_image: parsed.data.photo,
            garment_image: `data:image/webp;base64,${reference.toString("base64")}`,
            category: "auto",
            garment_photo_type: "model",
            mode: "balanced",
            moderation_level: "conservative",
            output_format: "jpeg",
            return_base64: true,
          },
        }),
        signal,
      });
      const job = z
        .object({ id: z.string().regex(/^[\w-]{1,160}$/) })
        .safeParse(await response.json());
      if (!response.ok || !job.success) {
        return c.json(
          { message: "The preview service is temporarily unavailable. Please try again later." },
          502,
        );
      }

      while (!signal.aborted) {
        const status = await fetch(`${provider}/status/${job.data.id}`, { headers, signal });
        const progress = z
          .object({
            status: z.enum(["starting", "in_queue", "processing", "completed", "failed"]),
            output: z.array(z.string()).optional().nullable(),
          })
          .safeParse(await status.json());
        if (!status.ok || !progress.success) {
          return c.json(
            { message: "We couldn't check your preview. Please try again later." },
            502,
          );
        }
        if (progress.data.status === "failed") {
          return c.json(
            {
              message:
                "We couldn't create a preview from this photo. Try a clear, front-facing photo.",
            },
            422,
          );
        }
        if (progress.data.status === "completed") {
          const image = readJpeg(progress.data.output?.[0] ?? "");
          if (!image)
            return c.json({ message: "We couldn't display the preview. Please try again." }, 502);
          return c.body(new Uint8Array(image), 200, { "Content-Type": "image/jpeg" });
        }
        await delay(waitMs, undefined, { signal });
      }
    } catch {
      if (!signal.aborted)
        return c.json(
          { message: "The preview service is temporarily unavailable. Please try again later." },
          502,
        );
    } finally {
      inFlight--;
    }
    return c.json({ message: "The preview took too long. Please try again." }, 504);
  },
);

function readJpeg(data: string) {
  if (!jpegData.test(data)) return undefined;
  const buffer = Buffer.from(data.slice(jpegPrefix.length), "base64");
  return buffer.length > 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
    ? buffer
    : undefined;
}

async function catalogPhoto(image: string) {
  const asset = storeImage(image).slice(1);
  for (const publicPath of ["public", ".output/public", "../public"]) {
    try {
      return await readFile(resolve(publicPath, asset));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("The catalog photo is unavailable.");
}
