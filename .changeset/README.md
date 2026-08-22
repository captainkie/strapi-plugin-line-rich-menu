# Changesets

Every change that reaches a published package needs a changeset. Run `pnpm changeset`,
pick the packages, pick the bump, and describe the change in one sentence a plugin user
would understand — not one a maintainer would.

`strapi-plugin-line-rich-menu` and `strapi-plugin-line-rich-menu-v4` are **fixed** together:
they always carry the same version number, because they are one product built twice for two
incompatible Strapi majors. Bumping one bumps the other.

`@fosivo/line-rich-menu-core` and `@fosivo/line-rich-menu-ui` are `private` and are bundled
into both plugins at build time. They are never published, so they never need a changeset.
