const path = require('path')

// สลับได้ด้วย DATABASE_CLIENT เพื่อให้ CI รัน matrix sqlite × postgres ได้จากแอปเดียว
// สเปก §13.4 — และเป็นด่านที่พิสูจน์ว่า lock query (Task 12) ทำงานได้ทั้งสอง dialect จริง
module.exports = ({ env }) => {
  const client = env('DATABASE_CLIENT', 'sqlite')

  if (client === 'postgres') {
    // Neon (and most managed Postgres free tiers) hand out one pooled connection string,
    // not five separate host/port/user/password fields — so `render.yaml` only has to pass
    // DATABASE_URL. This branch is additive: the CI matrix (.github/workflows/ci.yml) still
    // sets DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD directly and never sets DATABASE_URL,
    // so it keeps taking the `else` branch below unchanged — this was verified by running
    // the postgres leg of `pnpm e2e:v5` locally after this edit (see task-15-report.md).
    const connectionString = env('DATABASE_URL')
    return {
      connection: {
        client: 'postgres',
        connection: connectionString
          ? {
              connectionString,
              // Neon requires TLS and presents a publicly-trusted certificate (not
              // self-signed), so this stays a full-verification `ssl: true` rather than
              // `rejectUnauthorized: false` — weakening verification is not needed here and
              // would accept a MITM'd connection. DATABASE_SSL defaults to on for the
              // DATABASE_URL path since that path only exists for managed Postgres providers
              // that require it; set it to `false` only for a DATABASE_URL that is known to
              // be plaintext (e.g. a local proxy), which the demo never does.
              ssl: env.bool('DATABASE_SSL', true),
            }
          : {
              host: env('DATABASE_HOST', '127.0.0.1'),
              port: env.int('DATABASE_PORT', 5432),
              database: env('DATABASE_NAME', 'strapi'),
              user: env('DATABASE_USERNAME', 'strapi'),
              password: env('DATABASE_PASSWORD', 'strapi'),
            },
        pool: { min: 0, max: 5 },
      },
    }
  }

  return {
    connection: {
      client: 'sqlite',
      connection: { filename: path.join(__dirname, '..', env('DATABASE_FILENAME', '.tmp/data.db')) },
      useNullAsDefault: true,
    },
  }
}
