'use strict'

/**
 * Strapi 4 หา entry ของปลั๊กอินจากไฟล์ชื่อนี้ที่ root ของแพ็กเกจ (สเปก §2.1)
 * ไม่ใช่จาก `exports` map แบบ Strapi 5 — ไฟล์นี้จึงต้องเป็น CommonJS จริง ๆ และต้องอยู่ใน `files`
 *
 * `.default ?? mod` เพราะ tsup ปล่อย CJS ที่ห่อ default export ไว้ใต้ `.default` พร้อม
 * `__esModule: true` ส่วน loader ของ Strapi 4 คาดหวังอ็อบเจกต์ปลั๊กอินตรง ๆ
 * การแกะที่นี่ทำให้ฝั่ง TypeScript เขียน `export default` ได้ตามปกติ
 */
const mod = require('./dist/server/index.js')
module.exports = mod.default ?? mod
