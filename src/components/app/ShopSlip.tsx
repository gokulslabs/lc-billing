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
    body { width: 400px; margin: 0; color: #333; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #ddd; padding: 5px; text-align: left; vertical-align: top; }
    .center { text-align: center; }
    h3 { margin: 20px 0 10px; font-size: 24px; font-weight: 500; line-height: 1.1; }
    h4 { margin: 10px 0; font-size: 18px; font-weight: 500; line-height: 1.1; }
    @media print { body { width: 100%; } @page { margin: 8mm; } }
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
