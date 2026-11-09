# Storefront frontend snapshot

This folder is a standalone backup copy of the LC Billing storefront UI source and its related assets. The active app continues to run from the matching files under the repository `src/` and `public/` folders; this snapshot is not part of the build.

To restore a storefront file after removing it from the active app, copy the matching path under this folder back to the repository root, preserving the path after `frontend/`. For example, `frontend/src/routes/_store/index.tsx` restores to `src/routes/_store/index.tsx`.

Included: storefront routes, storefront components, catalog and trial-room data helpers, shared button/styles/auth client dependencies, and `public/store` images. The boutique mark is `public/lc-logo.png`.
