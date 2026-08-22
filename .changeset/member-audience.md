---
"strapi-plugin-line-rich-menu": minor
"strapi-plugin-line-rich-menu-v4": minor
---

Show one rich menu to members and another to everyone else. A new `LINE member`
collection holds per-channel LINE user IDs; the rich menu editor gains an **Audience**
field (Everyone or Members), and switching a members menu on links it to every member
in chunks of 500 through a resumable background job. Additive: existing menus default
to `all` and behave exactly as before.
