# Ladies Collections

Billing, stock, customers, and stitching for the boutique.

## Development

```sh
bun install
bun run dev
```

The shop site is served by `bun run build` and `bun start`.

## AI Trial Room

Open `/trial-room` from the storefront. The sample comparison and downloadable
QR code work without an AI account. Print a QR code generated from the deployed
storefront so shoppers can open it on their phones.

Set the server-side environment variable `FASHN_API_KEY` to enable personal
try-ons, then restart the server. With Bun you can set it in the local `.env`;
on Railway, add it as a service variable. The integration uses FASHN Virtual
Try-On v1.6 with catalog images. Uploads require consent, stay out of app
storage, and use the provider's base64 image flow. FASHN makes the generated
image available through its API for up to 60 minutes.

The endpoint accepts only the supported storefront garments. It caps requests
at three active requests and 24 attempts per hour per server process.
Set provider credit limits as appropriate for a public deployment.
