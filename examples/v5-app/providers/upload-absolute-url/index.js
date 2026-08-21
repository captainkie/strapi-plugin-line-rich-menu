'use strict'

/**
 * local provider ตัวจริงของ Strapi ที่ถูกห่อไว้บาง ๆ — ไม่ได้เขียนตรรกะการเก็บไฟล์ใหม่เลย
 *
 * ทำอย่างเดียว: ไฟล์ที่ชื่อขึ้นต้นด้วย `remote-` จะได้ `url` แบบสัมบูรณ์กลับไป
 * เหมือนที่ S3 หรือ Cloudinary คืน ส่วนไฟล์อื่นได้ url สัมพัทธ์ตามปกติของ local provider
 *
 * มีไว้เพื่อให้กิ่ง `fetch()` ของ `createImageStore.read()` ถูกเดินจริงในการบูตครั้งเดียวกัน
 * กับกิ่งอ่านจากดิสก์ — สองกิ่งนั้นเลือกทางจากรูปทรงของ url ล้วน ๆ ไม่ได้ดูชื่อ provider
 * จึงจำลองได้ตรงตัวโดยไม่ต้องติดตั้ง S3 ใน CI
 *
 * ไฟล์นี้เป็นของ `examples/v4-app` ไม่ใช่ของแพ็กเกจปลั๊กอิน — มันไม่ได้ถูกปล่อยขึ้น npm
 */
const local = require('@strapi/provider-upload-local')

const REMOTE_PREFIX = 'remote-'

module.exports = {
  init(providerOptions = {}) {
    const { baseUrl, ...localOptions } = providerOptions
    const inner = local.init(localOptions)

    const absolutize = (file) => {
      if (typeof baseUrl !== 'string' || baseUrl.length === 0) return
      if (typeof file.name !== 'string' || !file.name.startsWith(REMOTE_PREFIX)) return
      if (typeof file.url !== 'string' || !file.url.startsWith('/')) return
      file.url = `${baseUrl}${file.url}`
    }

    // `delete` ต้องแปลง url กลับเป็นสัมพัทธ์ก่อนส่งต่อ ไม่งั้น local provider จะประกอบ path
    // บนดิสก์จาก `http://...` แล้วลบไม่เจอ กลายเป็นไฟล์ค้างที่ไม่มีใครเก็บ
    const relativize = (file) => {
      if (typeof baseUrl === 'string' && typeof file.url === 'string' && file.url.startsWith(baseUrl)) {
        return { ...file, url: file.url.slice(baseUrl.length) }
      }
      return file
    }

    return {
      ...inner,
      async upload(file) {
        await inner.upload(file)
        absolutize(file)
      },
      async uploadStream(file) {
        await inner.uploadStream(file)
        absolutize(file)
      },
      delete(file) {
        return inner.delete(relativize(file))
      },
    }
  },
}
