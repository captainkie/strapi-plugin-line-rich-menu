# strapi-plugin-line-rich-menu

## 1.0.0

### Major Changes

- First public release.
  
  Design, schedule and publish LINE rich menus from inside the Strapi admin panel, on **both
  Strapi 4 and Strapi 5** — one shared React layer rendering against two incompatible design
  systems through an injected `UIPort`, so neither version's design system leaks into shared code.
  
  - **Templates and a drag-and-drop canvas.** Twelve built-in layouts across LINE's six canvas
    sizes, or adjust the areas by hand. Every action type LINE supports, each validated against
    its real limits at the field and again in the schema.
  - **Multi-tab menus via aliases**, and scheduled display periods with an end that must fall
    after its start — enforced in one place and applied by the form and both adapters' request
    schemas, so a caller that is not our form cannot walk past it.
  - **A publish path that cleans up after itself.** A rich menu cannot be edited after creation,
    so editing means create-new, swap, delete-old — a multi-step mutation of live state a process
    can die inside. Compensation reads the current default and alias *before* touching either and
    restores exactly what it read.
  - **Credentials that cannot leak by accident.** Channel access tokens are encrypted at rest with
    AES-256-GCM and an HKDF-derived key; the default read paths do not carry the token in their
    return type, so leaking one is a compile error rather than a review miss. The list path never
    decrypts at all — its preview comes from a stored last-four column.
  - **RBAC on every admin route**, with `settings` — which can read and rotate tokens — kept
    separate from `publish`.
  
  Verified by 1048 unit tests and acceptance suites that boot a real Strapi and install the plugin
  from a packed tarball rather than a workspace link: 32 against Strapi 4.25.11, 35 against
  Strapi 5.52.1, on both SQLite and Postgres.
