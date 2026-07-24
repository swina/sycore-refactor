# Default Drum Kit — Asset Pool

Drop `.wav`, `.mp3`, `.ogg`, `.m4a`, or `.flac` files in this folder to make them available for admins to assign to Drum Machine's Default Kit slots (via the "Edit Default Kit" button in the app, visible only to the admin account).

Files here are bundled into the app build automatically — no manifest to maintain, just add the file and commit/deploy. They're discovered via `src/lib/default-kit-assets.ts`.

This file itself is ignored by the discovery glob (only audio extensions match).
