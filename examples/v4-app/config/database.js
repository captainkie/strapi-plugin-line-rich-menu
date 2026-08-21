const path = require('path')

// สลับได้ด้วย DATABASE_CLIENT เพื่อให้ CI รัน matrix sqlite × postgres ได้จากแอปเดียว
// สเปก §13.4 — และเป็นด่านที่พิสูจน์ว่า lock query (Task 12) ทำงานได้ทั้งสอง dialect จริง
module.exports = ({ env }) => {
  const client = env('DATABASE_CLIENT', 'sqlite')

  if (client === 'postgres') {
    return {
      connection: {
        client: 'postgres',
        connection: {
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
