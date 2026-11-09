import { Copy, Download, QrCode } from "lucide-react";
import qrcode from "qrcode-generator";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TrialShare() {
  const [share, setShare] = useState<{ url: string; image: string }>();
  const [message, setMessage] = useState("");

  function open() {
    if (share) return;
    const url = new URL("/trial-room", window.location.origin).href;
    const code = qrcode(0, "M");
    code.addData(url);
    code.make();
    setShare({
      url,
      image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code.createSvgTag(5, 20))}`,
    });
  }

  async function copy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setMessage("Link copied.");
    } catch {
      setMessage("Select the link below to copy it.");
    }
  }

  return (
    <details className="store-surface mt-6 px-4 py-3">
      <summary className="w-fit cursor-pointer font-medium text-primary" onClick={open}>
        <QrCode size={17} className="mr-2 inline" /> Share the Trial Room
      </summary>
      {share && (
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-[8rem_1fr]">
          <img
            src={share.image}
            alt="QR code that opens the AI Trial Room"
            className="aspect-square w-32 rounded-sm border bg-white"
          />
          <div>
            <p className="text-sm text-muted-foreground">
              Scan the code or share the link to open the outfit collection.
            </p>
            <input
              readOnly
              aria-label="Trial Room link"
              value={share.url}
              className="mt-2 w-full rounded border bg-background px-2 py-1.5 text-sm"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                <Copy /> Copy link
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={share.image} download="ladies-collections-trial-room.svg">
                  <Download /> Download QR
                </a>
              </Button>
            </div>
            <span role="status" className="mt-2 block text-sm text-muted-foreground">
              {message}
            </span>
          </div>
        </div>
      )}
    </details>
  );
}
