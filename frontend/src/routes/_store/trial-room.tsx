import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Download, ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { eyebrow, wrap } from "@/components/store/catalog";
import { prepareTrialPhoto, trialPhotoFormats } from "@/components/store/trial-photo";
import { TrialShare } from "@/components/store/trial-share";
import { Button } from "@/components/ui/button";
import { storeImage } from "@/lib/storefront";
import { exampleOutfitId, trialOutfits, trialRoomApiPath } from "@/lib/trial-room";

export const Route = createFileRoute("/_store/trial-room")({
  validateSearch: (search: Record<string, unknown>): { outfit?: string } => {
    const id = search["outfit"];
    return typeof id === "string" && trialOutfits.some((outfit) => outfit.id === id)
      ? { outfit: id }
      : {};
  },
  head: () => ({ meta: [{ title: "AI Trial Room | Ladies Collections" }] }),
  component: TrialRoom,
});

const exampleBefore = storeImage("trial-example-before");
const exampleAfter = storeImage("trial-example-after");

function TrialRoom() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const outfit = trialOutfits.find((product) => product.id === search.outfit) ?? trialOutfits[0]!;
  const [photo, setPhoto] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [example, setExample] = useState(false);
  const [result, setResult] = useState<{ outfitId: string; before: string; image: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useRef<AbortController | null>(null);
  const preview = useRef<HTMLElement>(null);

  const availability = useQuery({
    queryKey: ["trial-room-availability"],
    queryFn: async ({ signal }) => {
      const response = await fetch(trialRoomApiPath, { signal });
      if (!response.ok) throw new Error("Trial room unavailable");
      const data: { available?: boolean } = await response.json();
      return data.available === true;
    },
    staleTime: 60_000,
    retry: false,
  });
  const live = availability.data === true;

  useEffect(() => () => run.current?.abort(), []);
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.image);
  }, [result]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    setPreparing(true);
    try {
      const nextPhoto = await prepareTrialPhoto(file);
      setPhoto(nextPhoto);
      setConsent(false);
      setResult(undefined);
      setExample(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Choose another photo.");
    } finally {
      setPreparing(false);
    }
  }

  function selectOutfit(id: string, showExample = false) {
    setExample(showExample);
    setResult(undefined);
    setError("");
    void navigate({ search: { outfit: id }, replace: true, resetScroll: false });
    if (showExample) preview.current?.scrollIntoView({ block: "nearest" });
  }

  async function generate() {
    if (!photo || !consent || !live || run.current) return;
    const controller = new AbortController();
    run.current = controller;
    setBusy(true);
    setError("");
    setResult(undefined);
    setExample(false);
    try {
      const response = await fetch(trialRoomApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id, photo, consent }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body: { message?: string } = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "The preview is unavailable. Please try again.");
      }
      if (response.headers.get("Content-Type")?.split(";")[0] !== "image/jpeg") {
        throw new Error("We couldn't display the preview. Please try again.");
      }
      const image = await response.blob();
      if (!controller.signal.aborted) {
        setResult({ outfitId: outfit.id, before: photo, image: URL.createObjectURL(image) });
        preview.current?.scrollIntoView({ block: "nearest" });
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : "The preview is unavailable.");
      }
    } finally {
      run.current = null;
      setBusy(false);
    }
  }

  const activeResult = result?.outfitId === outfit.id ? result : undefined;
  const showingExample = example && outfit.id === exampleOutfitId;
  return (
    <div className={`${wrap} pt-6 sm:pt-9`}>
      <section className="trial-masthead">
        <div>
          <p className="store-editorial-label trial-gold">
            <Sparkles size={14} aria-hidden="true" /> The virtual fitting room
          </p>
          <h1 className="mt-2 text-5xl leading-[.95] font-semibold sm:text-7xl">AI Trial Room</h1>
          <p className="mt-3 max-w-md text-sm sm:text-base">
            Choose a piece from the boutique and see how it could look on you.
          </p>
        </div>
      </section>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="store-surface min-w-0 p-4 sm:p-6">
          <fieldset disabled={busy}>
            <legend className={eyebrow}>01 · Choose an outfit</legend>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {trialOutfits.map((product) => (
                <label className="trial-outfit relative block cursor-pointer" key={product.id}>
                  <input
                    type="radio"
                    name="trial-outfit"
                    value={product.id}
                    checked={outfit.id === product.id}
                    onChange={() => selectOutfit(product.id)}
                    className="peer sr-only"
                  />
                  <span className="block overflow-hidden rounded-md border bg-background peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                    <img
                      src={storeImage(product.category.image)}
                      alt=""
                      className="aspect-[4/5] w-full object-cover object-top"
                    />
                    <span className="block px-2 py-2 text-xs leading-tight">{product.name}</span>
                  </span>
                  {outfit.id === product.id && (
                    <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check size={14} />
                    </span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 border-t pt-5">
            <h2 className={eyebrow}>02 · Add your photo</h2>
            {live ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Use a clear, front-facing photo of yourself in good light. Show as much of the
                  outfit area as possible.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="trial-upload relative inline-flex items-center gap-2 rounded border border-dashed border-input px-3 py-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
                    <ImagePlus size={18} aria-hidden="true" />{" "}
                    {preparing ? "Preparing photo…" : photo ? "Replace photo" : "Choose a photo"}
                    <input
                      aria-label={photo ? "Replace photo" : "Choose a photo"}
                      type="file"
                      accept={trialPhotoFormats}
                      disabled={busy || preparing}
                      onChange={(event) => void choosePhoto(event)}
                      className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                  </label>
                  {photo && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || preparing}
                      onClick={() => {
                        setPhoto(undefined);
                        setConsent(false);
                        setResult(undefined);
                        setError("");
                      }}
                    >
                      <X /> Remove photo
                    </Button>
                  )}
                </div>
                {photo && (
                  <label className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                      checked={consent}
                      disabled={busy}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    <span>
                      I agree to send my photo to FASHN AI to generate this preview.{" "}
                      <a
                        className="underline underline-offset-2"
                        href="https://docs.fashn.ai/api-overview/data-retention-privacy"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Photo privacy
                      </a>
                    </span>
                  </label>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {availability.isPending
                  ? "Checking personal try-on availability…"
                  : "Personal try-on is currently unavailable. Try the example to see how it works."}
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {live && (
              <Button
                className="store-action"
                disabled={!photo || !consent || busy || preparing}
                onClick={() => void generate()}
              >
                {busy ? <LoaderCircle className="motion-safe:animate-spin" /> : <Sparkles />}{" "}
                {busy ? "Creating preview…" : "Generate preview"}
              </Button>
            )}
            {busy ? (
              <Button
                variant="outline"
                className="store-action"
                onClick={() => run.current?.abort()}
              >
                Stop waiting
              </Button>
            ) : (
              <Button
                variant={live ? "outline" : "default"}
                className="store-action"
                onClick={() => selectOutfit(exampleOutfitId, true)}
              >
                View sample try-on <ArrowUpRight />
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <section
          ref={preview}
          aria-labelledby="trial-preview-title"
          aria-busy={busy}
          className="store-surface trial-preview min-w-0 scroll-mt-28 p-4 sm:p-6"
        >
          <p className={eyebrow}>03 · The reveal</p>
          <h2 id="trial-preview-title" className="mt-1 text-3xl font-semibold sm:text-4xl">
            Your preview
          </h2>
          <span role="status" className="sr-only">
            {activeResult
              ? "Your preview is ready."
              : showingExample
                ? "Sample preview is ready."
                : ""}
          </span>
          {activeResult || showingExample ? (
            <>
              {showingExample && (
                <p className="mt-1 text-sm text-muted-foreground">Sample with a fictional model</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                <TrialImage
                  src={activeResult?.before ?? exampleBefore}
                  label="Before"
                  alt={activeResult ? "Your original photo" : "Sample model in her original outfit"}
                />
                <TrialImage
                  src={activeResult?.image ?? exampleAfter}
                  label="AI try-on"
                  alt={`Preview of ${outfit.name} on the ${activeResult ? "uploaded photo" : "sample model"}`}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  className="store-editorial-link"
                  to="/shop/$slug"
                  params={{ slug: outfit.id }}
                >
                  View outfit <ArrowUpRight size={15} />
                </Link>
                {activeResult && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={activeResult.image} download={`${outfit.id}-try-on.jpg`}>
                      <Download /> Save preview
                    </a>
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
              <TrialImage
                src={photo ?? storeImage(outfit.category.image)}
                label={photo ? "Your photo" : "Selected outfit"}
                alt={photo ? "Your uploaded photo" : outfit.name}
              />
              <div role="status" className="trial-placeholder aspect-[4/5]">
                {busy ? (
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
                <span>{busy ? "Putting the look together…" : "Your try-on will appear here"}</span>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            AI previews are for styling. Check product measurements to choose your size.
          </p>
        </section>
      </div>
      <TrialShare />
    </div>
  );
}

function TrialImage({ src, label, alt }: { src: string; label: string; alt: string }) {
  return (
    <figure className="relative aspect-[4/5] overflow-hidden rounded-md bg-secondary">
      <img src={src} alt={alt} className="size-full object-contain" />
      <figcaption className="trial-image-label">{label}</figcaption>
    </figure>
  );
}
