import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// vitest.config.ts ไม่ได้เปิด test.globals ทำให้ @testing-library/react
// หา `afterEach` ระดับ global ไม่เจอตอน import จึงไม่ auto-cleanup ให้เอง
// (เช็คโค้ดเขาเอง: `if (typeof afterEach === 'function')`) — ถ้าไม่ unmount เอง
// DOM จาก render() ของ test ก่อนหน้าจะค้างข้ามไปยัง test ถัดไปในไฟล์เดียวกัน
afterEach(() => {
  cleanup()
})
