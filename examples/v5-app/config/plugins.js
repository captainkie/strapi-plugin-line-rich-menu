module.exports = ({ env }) => ({
  // ไม่มีบล็อกนี้มาก่อน — users-permissions พังเงียบ ๆ เฉพาะตอน production เท่านั้น: bootstrap
  // ของมัน throw ทันทีถ้าไม่เจอ jwtSecret และ NODE_ENV ไม่ใช่ 'development' (ดูซอร์สที่
  // node_modules/@strapi/plugin-users-permissions/dist/server/bootstrap/index.js) ตอน dev มันสุ่ม
  // ค่าให้เองแล้วเขียนกลับลง .env ให้เงียบ ๆ ซึ่งเป็นเหตุผลที่ e2e.sh/CI (ไม่ได้ตั้ง NODE_ENV=production)
  // ไม่เคยเจอ แต่ image ของ Dockerfile ตั้ง NODE_ENV=production และไม่มี .env ติดไปด้วย (ถูก
  // .dockerignore กันไว้) จึง crash ทันทีที่บูต — เจอจริงตอนรัน image ใน task-15-report.md
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
    },
  },

  'line-rich-menu': {
    enabled: true,
    config: {
      encryptionKey: env('LINE_RM_ENCRYPTION_KEY'),
      // ชี้ไป tools/line-mock เพื่อให้ CI รันได้โดยไม่ต้องมี credential จริง (สเปก §13.4)
      lineApiBaseUrl: env('LINE_API_BASE_URL', 'https://api.line.me'),
      lineApiDataBaseUrl: env('LINE_API_DATA_BASE_URL', 'https://api-data.line.me'),
      // ปิด cron ในเทสต์ เพื่อให้ tick เกิดเฉพาะตอนที่เทสต์ยิงเองผ่าน /schedules/tick
      // ไม่งั้นงานที่ตั้งเวลาไว้จะถูกรันโดยรอบ cron ระหว่างที่เทสต์กำลัง assert อยู่พอดี
      scheduler: { enabled: env.bool('LINE_RM_SCHEDULER', false), cron: '* * * * *', lockTtlMs: 300000 },
    },
  },

  // provider นี้เป็น "อุปกรณ์ของแอปตัวอย่าง" ไม่ใช่ของปลั๊กอิน — มันคือ local provider ตัวจริง
  // ที่ถูกห่อไว้เพื่อคืน url แบบสัมบูรณ์ให้ไฟล์ที่ชื่อขึ้นต้นด้วย `remote-` เท่านั้น
  //
  // เหตุผล: `createImageStore.read()` มีสองกิ่ง — กิ่งอ่านจากดิสก์ (provider แบบ local คืน
  // url สัมพัทธ์) กับกิ่ง fetch (S3/Cloudinary คืน url เต็ม) ถ้าใช้ local provider เปล่า ๆ
  // กิ่ง fetch จะไม่เคยถูกเดินเลยแม้แต่ครั้งเดียวในทั้งแผน การแยกด้วยชื่อไฟล์ทำให้ทั้งสองกิ่ง
  // ถูกพิสูจน์ในการบูตครั้งเดียว โดยที่เส้นทางหลัก (ไฟล์ชื่อธรรมดา) ยังเป็น local provider แท้ ๆ
  // เหมือนที่ลูกค้าได้ ไม่ได้ถูกดัดแปลง
  //
  // The demo (docs/DEMO.md) switches this to Cloudinary whenever CLOUDINARY_NAME is present —
  // Render free's disk is ephemeral, so anything saved to `public/uploads` vanishes on the
  // next deploy or cold start, which would make the plugin look broken for a reason that has
  // nothing to do with the plugin. e2e.sh, scripts/screenshots.sh and local `develop` never
  // set CLOUDINARY_NAME, so they keep taking the local-provider branch unchanged.
  upload: env('CLOUDINARY_NAME')
    ? {
        config: {
          provider: 'cloudinary',
          providerOptions: {
            cloud_name: env('CLOUDINARY_NAME'),
            api_key: env('CLOUDINARY_KEY'),
            api_secret: env('CLOUDINARY_SECRET'),
          },
          actionOptions: { upload: {}, delete: {} },
        },
      }
    : {
        config: {
          provider: 'strapi-provider-upload-absolute-url',
          providerOptions: {
            baseUrl: `http://${env('HOST', '127.0.0.1')}:${env.int('PORT', 1337)}`,
          },
        },
      },
})
