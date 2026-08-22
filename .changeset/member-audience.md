---
"strapi-plugin-line-rich-menu": minor
"strapi-plugin-line-rich-menu-v4": minor
---

Show one rich menu to members and another to everyone else. A new `LINE member`
collection holds per-channel LINE user IDs; a menu can target `all` or `members`,
and activating one links it to every member in chunks of 500 through a resumable
background job. Additive: existing menus default to `all` and behave exactly as before.
