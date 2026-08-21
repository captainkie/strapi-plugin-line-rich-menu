'use strict'

// เหตุผลเดียวกับ strapi-server.js — ดูคอมเมนต์ในไฟล์นั้น
const mod = require('./dist/admin/index.js')
module.exports = mod.default ?? mod
