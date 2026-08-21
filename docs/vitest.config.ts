import { defineConfig } from 'vitest/config'

// เอกสารเป็นสิ่งที่ผู้ใช้เห็นก่อนโค้ดเสมอ — ปล่อยให้มันผิดได้เงียบ ๆ แปลว่าคนที่ตัดสินใจติดตั้ง
// ตัดสินใจจากข้อมูลที่ผิด project นี้จึงมีเทสต์ของตัวเองเหมือนแพ็กเกจอื่น
export default defineConfig({
  test: {
    name: 'docs',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
