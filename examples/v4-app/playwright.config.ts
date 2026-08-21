import { readFileSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

/**
 * โหลด `.env` เองแทนที่จะพึ่ง dotenv ของ Strapi — Playwright เป็นคนละโปรเซสและไม่ได้บูต Strapi
 * ถ้าไม่โหลด อีเมล/รหัสผ่านจะเป็น undefined แล้วเทสต์จะล้มด้วยข้อความ "login ของ undefined"
 * ซึ่งชี้ไปผิดที่ทั้งหมด ค่าที่ตั้งมาจากภายนอก (เช่น CI) ต้องชนะไฟล์เสมอ จึงไม่เขียนทับ
 */
try {
  const file = readFileSync(new URL('.env', import.meta.url), 'utf8')
  for (const line of file.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match === null) continue
    const [, key, value] = match
    if (process.env[key] === undefined) process.env[key] = value.trim()
  }
} catch {
  // ไม่มี .env ก็ได้ ถ้าตัวแปรถูกตั้งมาจากข้างนอกครบแล้ว — ด่านข้างล่างเป็นคนตัดสิน
}

const required = [
  'E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD',
  'E2E_AUTHOR_EMAIL', 'E2E_AUTHOR_PASSWORD',
  'E2E_READER_EMAIL', 'E2E_READER_PASSWORD',
]
const missing = required.filter((name) => (process.env[name] ?? '') === '')
if (missing.length > 0) {
  throw new Error(`ตัวแปรที่จำเป็นหายไป: ${missing.join(', ')} — คัดลอก .env.example เป็น .env ก่อน`)
}

export default defineConfig({
  testDir: './tests',
  // Strapi 4 บูตช้าและ publish เดินหลาย round trip — 60 วินาทีคือกันค้าง ไม่ใช่เกณฑ์ประสิทธิภาพ
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // ต้องเป็น 1 — เทสต์ทั้งชุดใช้ฐานข้อมูลเดียวกันและตั้ง default menu ตัวเดียวกันบน mock
  workers: 1,
  retries: 0,
  // ไฟล์เดียวและต้องเดินตามลำดับที่เขียนไว้ — เทสต์หลังพึ่ง channel/menu ที่เทสต์แรกสร้าง
  fullyParallel: false,
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:1337',
    trace: 'retain-on-failure',
  },
})
