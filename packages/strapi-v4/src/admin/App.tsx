import { Route, Switch } from 'react-router-dom'
import { PortProvider } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from '../server/permissions.js'
import { usePluginPort } from './port.js'
import { EditorPage } from './pages/Editor.js'
import { ListPage } from './pages/List.js'

const BASE = `/plugins/${PLUGIN_ID}`

/**
 * router v5 — `Switch` + `Route component` (v6 ใช้ `Routes` + `element` ซึ่งเป็นคนละ API
 * และเป็นหนึ่งในเหตุผลที่ปลั๊กอินสองเวอร์ชันแชร์แพ็กเกจกันไม่ได้ ดูสเปก §2.1)
 * `/rich-menus/new` ต้องมาก่อน `/rich-menus/:id` ไม่งั้น `new` จะถูกจับเป็น id
 */
export default function App() {
  const port = usePluginPort()
  return (
    <PortProvider value={port}>
      <Switch>
        <Route path={`${BASE}/rich-menus/new`} component={EditorPage} exact />
        <Route path={`${BASE}/rich-menus/:id`} component={EditorPage} exact />
        <Route path={BASE} component={ListPage} />
      </Switch>
    </PortProvider>
  )
}
