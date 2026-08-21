import { Route, Routes } from 'react-router-dom'
import { PortProvider } from '@fosivo/line-rich-menu-ui'
import { usePluginPort } from './port.js'
import { EditorPage } from './pages/Editor.js'
import { ListPage } from './pages/List.js'

/**
 * router v6 — `Routes` + `element` (v5 ใช้ `Switch` + `component` ซึ่งเป็นคนละ API และเป็น
 * หนึ่งในเหตุผลที่ปลั๊กอินสองเวอร์ชันแชร์แพ็กเกจกันไม่ได้ ดูสเปก §2.1)
 *
 * path เป็นแบบสัมพัทธ์ ไม่มี `/plugins/line-rich-menu` นำหน้าเหมือน v4 — Strapi 5 mount
 * ปลั๊กอินไว้ใต้ path นั้นแล้วผ่าน `addMenuLink` ทำให้ router ตัวนี้อยู่ในบริบทที่ base ถูกตัด
 * ให้แล้ว ใส่ path เต็มจะกลายเป็น `/plugins/line-rich-menu/plugins/line-rich-menu/...`
 * ซึ่งไม่ match อะไรเลยและได้หน้าเปล่าโดยไม่มี error
 *
 * v6 ไม่มี `exact` แล้ว — การ match เป็นแบบตรงตัวโดยปริยาย และ `new` กับ `:id` ไม่ชนกัน
 * เพราะ v6 ให้ segment ที่เป็น literal ชนะ dynamic segment เสมอ ไม่ขึ้นกับลำดับที่เขียน
 */
export default function App() {
  const port = usePluginPort()
  return (
    <PortProvider value={port}>
      <Routes>
        <Route path="rich-menus/new" element={<EditorPage />} />
        <Route path="rich-menus/:id" element={<EditorPage />} />
        <Route path="*" element={<ListPage />} />
      </Routes>
    </PortProvider>
  )
}
