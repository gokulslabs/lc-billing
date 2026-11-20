export const LEGACY_PRINT_TITLE = "LADIES COLLECTIONS - Inventory Management System";

const SHOP_ADDRESS_HTML =
  "#101/A, ARCOT ROAD, OPP TO OLD EMPLOYMENT OFFICE,<br>KAGITHAPATARAI,<br>VELLORE - 632012";

export function escapePrint(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}

export function legacyDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

export function plainAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function printLegacySlipInSameTab(body: string): boolean {
  return printHtmlInSameTab(`<!doctype html><html><head><meta charset="utf-8"><title>${LEGACY_PRINT_TITLE}</title><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #222; font-family: Arial, sans-serif; }
    body { width: 100%; max-width: 190mm; margin: 0 auto; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 2mm; break-inside: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #555; padding: 2px 4px; text-align: left; vertical-align: top; }
    .center { text-align: center; }
    h3 { margin: 2mm 0; font-size: 14pt; font-weight: 600; line-height: 1.1; }
    h4 { margin: 1mm 0; font-size: 9pt; font-weight: 600; line-height: 1.15; }
    @page { size: A4 portrait; margin: 6mm; }
    @media print { html, body { width: 100%; } body { max-width: none; } }
  </style></head><body>${body}</body></html>`);
}

export function printStitchingSlipInSameTab(body: string): boolean {
  return printHtmlInSameTab(`<!doctype html><html><head><meta charset="utf-8"><title>${LEGACY_PRINT_TITLE}</title><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #333; font-family: Arial, sans-serif; }
    body { width: 185mm; max-width: 100%; margin: 0 auto; font-size: 10pt; font-weight: 500; }
    table { width: 100%; border: 0; border-collapse: collapse; margin: 0 0 2mm; table-layout: fixed; break-inside: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 0; padding: 1.5mm 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; color: #333; }
    th { background: transparent; font-weight: 600; }
    .center { text-align: center; }
    h3 { margin: 1mm 0; font-size: 14pt; font-weight: 600; line-height: 1.1; }
    h4 { margin: 0.5mm 0; font-size: 9.5pt; font-weight: 500; line-height: 1.15; color: #333; }
    @page { size: A4 portrait; margin: 6mm; }
    @media print { html { width: 100%; } body { width: 185mm; max-width: 100%; margin: 0 auto; color: #333 !important; font-weight: 500; } }
  </style></head><body>${body}</body></html>`);
}

/** Print a standalone document through an invisible frame in this tab. */
export function printHtmlInSameTab(html: string): boolean {
  const frame = document.createElement("iframe");
  frame.title = "Print document";
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100vw",
    height: "100vh",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  });

  let removed = false;
  const removeFrame = () => {
    if (removed) return;
    removed = true;
    window.clearTimeout(fallback);
    frame.remove();
  };
  const fallback = window.setTimeout(removeFrame, 120_000);
  document.body.appendChild(frame);

  frame.addEventListener(
    "load",
    () => {
      const printWindow = frame.contentWindow;
      if (!printWindow) {
        removeFrame();
        return;
      }
      const finish = () => window.setTimeout(removeFrame, 0);
      printWindow.addEventListener("afterprint", finish, { once: true });
      window.addEventListener("afterprint", finish, { once: true });
      const fontsReady = printWindow.document.fonts?.ready ?? Promise.resolve();
      void fontsReady
        .catch(() => undefined)
        .then(() => {
          window.requestAnimationFrame(() => {
            printWindow.focus();
            printWindow.print();
          });
        });
    },
    { once: true },
  );
  frame.srcdoc = html;
  return true;
}

export function shopHeading(address = true): string {
  return `<tr><th class="center" colspan="2"><h3>LADIES COLLECTIONS</h3>${address ? `<h4>${SHOP_ADDRESS_HTML}</h4>` : ""}</th></tr>`;
}

export function slipRow(label: string, value: string): string {
  return `<tr><th><h4>${escapePrint(label)}</h4></th><td><h4>${escapePrint(value)}</h4></td></tr>`;
}
