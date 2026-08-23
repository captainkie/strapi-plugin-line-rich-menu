module.exports = ({ env }) => ({
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
      // Task 17 — ยกเพดาน publish เฉพาะแอปตัวอย่าง ไม่ใช่ค่าที่ปลั๊กอินส่งมอบ
      //
      // ค่า default ของปลั๊กอินคือ capacity 3 / refill 6 ต่อนาที = เติมกลับหนึ่งใบทุกสิบวินาที ซึ่ง
      // เหมาะกับ "คนกดปุ่มรัว" แต่ชุด e2e ทั้งไฟล์ publish สี่ถึงห้าครั้งบน channel เดียวภายในเวลา
      // ไม่ถึงสิบวินาที (เมนูหลัก, เมนูตั้งเวลา, เมนูสมาชิก แล้ว publish ซ้ำหลังปิดสวิตช์) — ด่านที่
      // พิสูจน์ว่า "ปิดสวิตช์แล้ว publish ซ้ำได้จริง" จึงชน 429 ด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่มัน
      // ตั้งใจพิสูจน์เลย
      //
      // ไม่ได้ทิ้ง coverage ของตัวจำกัดไป — มันมีเทสต์ของตัวเองที่ packages/core/tests/server/
      // rate-limit.test.ts และเคส "ถูก rate limit → ไม่แตะ LINE เลย ไม่สร้างแถว audit" ที่
      // publish.test.ts ซึ่งทั้งคู่ยิงตรงเข้าที่ตัวจำกัดจริง ไม่ได้พึ่งค่า config ของแอปนี้
      publishRateLimit: { capacity: 20, refillPerMinute: 60 },
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
  upload: {
    config: {
      provider: 'strapi-provider-upload-absolute-url',
      providerOptions: {
        baseUrl: `http://${env('HOST', '127.0.0.1')}:${env.int('PORT', 1337)}`,
      },
    },
  },
})
