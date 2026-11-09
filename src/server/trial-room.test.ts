import { afterEach, describe, expect, it, vi } from "vitest";
import { exampleOutfitId, trialRoomApiPath } from "@/lib/trial-room";
import { trialRoomApi } from "./trial-room";

// Small JPEG-shaped fixture for checking the transport to and from the mocked provider.
const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const photo = `data:image/jpeg;base64,${bytes.toString("base64")}`;
const input = { outfitId: exampleOutfitId, photo, consent: true };

function submit(body: object, headers: Record<string, string> = {}) {
  return trialRoomApi.request(trialRoomApiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("storefront try-on", () => {
  it("offers sample mode when the server key is absent", async () => {
    vi.stubEnv("FASHN_API_KEY", "");
    const availability = await trialRoomApi.request(trialRoomApiPath);
    expect(await availability.json()).toEqual({ available: false });
    expect((await submit(input)).status).toBe(503);
  });

  it("rejects cross-site uploads, missing consent and non-wearable products before contacting the provider", async () => {
    vi.stubEnv("FASHN_API_KEY", "test-key");
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);

    expect((await submit(input, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await submit({ ...input, consent: false })).status).toBe(400);
    expect((await submit({ ...input, outfitId: "bagh-block-print-cotton" })).status).toBe(400);
    expect(
      (await submit({ ...input, photo: `data:image/jpeg;base64,${"a".repeat(1_605_000)}` })).status,
    ).toBe(413);
    expect(provider).not.toHaveBeenCalled();
  });

  it("sends the chosen catalog image and returns the completed preview privately", async () => {
    vi.stubEnv("FASHN_API_KEY", "test-key");
    const provider = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "example-prediction" }))
      .mockResolvedValueOnce(Response.json({ status: "completed", output: [photo] }));
    vi.stubGlobal("fetch", provider);

    const response = await submit(input, { "Sec-Fetch-Site": "same-origin" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);

    const [url, request] = provider.mock.calls[0]!;
    expect(url).toBe("https://api.fashn.ai/v1/run");
    const { model_name, inputs } = JSON.parse(request.body);
    expect(model_name).toBe("tryon-v1.6");
    expect(inputs.model_image).toBe(photo);
    expect(inputs.garment_image).toMatch(/^data:image\/webp;base64,/);
    expect(inputs.return_base64).toBe(true);
    expect(provider.mock.calls[1]?.[0]).toBe("https://api.fashn.ai/v1/status/example-prediction");
  });
});
