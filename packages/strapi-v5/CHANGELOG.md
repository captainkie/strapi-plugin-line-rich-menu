# strapi-plugin-line-rich-menu

## 1.1.1

### Patch Changes

- Keep the Audience column from stretching a list row. The hint under a disabled
  members toggle was a full sentence repeating what the Audience and Status columns
  already show, so in a narrow column it wrapped to eight lines and pushed the row
  to roughly 400px tall; "Unlink everyone" broke mid-phrase and read as two stacked
  buttons. The hint is now one short line rendered at hint size, the cell has a
  minimum width so a short sentence cannot become a paragraph, and the button keeps
  its label on one line.

## 1.1.0

### Minor Changes

- Show one rich menu to members and another to everyone else. A new `LINE member`
  collection holds per-channel LINE user IDs; the rich menu editor gains an **Audience**
  field (Everyone or Members), and switching a members menu on links it to every member
  in chunks of 500 through a resumable background job. A menu set to Members is never
  made the account default, so it is never shown to non-members: publishing one leaves
  LINE's default alone, and the operations that would break the link between a menu's
  audience, its channel's member pointer and its rich menu on LINE are refused with a
  message naming the fix rather than silently repaired. Additive: existing menus default
  to `all` and behave exactly as before.

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
