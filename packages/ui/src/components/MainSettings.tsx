import { combineDisplayAt, splitDisplayAt } from '../datetime.js'
import { usePort } from '../port.js'
import { CharCount } from './CharCount.js'

/** จำนวนตัวอักษรสูงสุดของ Title — ค่าเดียวที่ทั้ง `maxLength` และ `CharCount` ใช้ ไม่พิมพ์ซ้ำ */
const TITLE_MAX = 30

export interface MainSettingsValue {
  /** ชื่อสำหรับจัดการภายใน จำกัด 30 ตัว — คนละตัวกับ `name` ใน payload ของ LINE ที่ยอมได้ 300 */
  title: string
  /**
   * ISO datetime string เดียว (หรือ `''` ถ้ายังไม่ตั้ง) — สัญญาเดิมที่ `RichMenuDraft` และ
   * Editor.tsx ของทั้งสอง adapter ยังพึ่งอยู่ ไม่เปลี่ยน แม้หน้าตาที่ผู้ใช้เห็นจะเป็นวันที่ + เวลา
   * แยกกันสองช่อง (สเปกงานนี้ #4) — `splitDisplayAt`/`combineDisplayAt` (ดู `../datetime.js`)
   * คือสะพานระหว่างสองรูปทรงนี้ ที่นี่จุดเดียว
   */
  startAt: string
  endAt: string
  /**
   * ใครควรเห็นเมนูนี้ (สเปก "Two menus, two audiences") — Task 14b item 1
   *
   * อยู่ใน `MainSettings` เพราะที่นี่คือกลุ่มของคำถาม "เมนูนี้คืออะไร" (ชื่อ, ช่วงเวลาแสดงผล)
   * ไม่ใช่ "เมนูนี้หน้าตายังไง" — และก่อนหน้านี้ค่านี้ตั้งจากที่ไหนในผลิตภัณฑ์ไม่ได้เลย ทางเดียวคือ
   * POST เองด้วยมือ (Task 14 พบตอนเขียนคู่มือ) ทั้ง ๆ ที่มันคือแนวคิดหลักของฟีเจอร์ทั้งอัน
   *
   * **ไม่ใช่** เรื่องเดียวกับสวิตช์ "เปิดใช้งานสำหรับสมาชิก" ใน `AudienceToggle` — ตัวนี้คือ *เจตนา*
   * ที่ประกาศไว้บนแถวเมนู (เก็บในคอลัมน์ `audience`) ส่วนสวิตช์นั้นคือ *การกระทำ* ที่ทำให้เมนูนี้
   * เป็นเมนูสมาชิกที่ live อยู่จริง (เขียน `channel.memberRichMenuId` แล้วสั่งผูกสมาชิกทุกคน)
   * สวิตช์ทำงานได้ก็ต่อเมื่อค่านี้เป็น 'members' แล้วเท่านั้น (409 `menu_not_members_audience`)
   */
  audience: 'all' | 'members'
}

export interface MainSettingsProps {
  value: MainSettingsValue
  onChange(next: MainSettingsValue): void
  errors?: Partial<Record<keyof MainSettingsValue, string>>
}

export function MainSettings({ value, onChange, errors }: MainSettingsProps) {
  const { ui, t } = usePort()
  const set = <K extends keyof MainSettingsValue>(key: K, next: MainSettingsValue[K]) =>
    onChange({ ...value, [key]: next })

  const start = splitDisplayAt(value.startAt)
  const end = splitDisplayAt(value.endAt)

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography as="h2" variant="delta">{t('editor.mainSettings')}</ui.Typography>
      <ui.Flex direction="column" gap={1}>
        <ui.TextInput
          name="title"
          label={t('editor.title')}
          value={value.title}
          maxLength={TITLE_MAX}
          hint={t('editor.title.hint')}
          onChange={(next) => set('title', next)}
          {...(errors?.title === undefined ? {} : { error: errors.title })}
        />
        <CharCount value={value.title} max={TITLE_MAX} />
      </ui.Flex>

      {/*
        สเปกงานนี้ #4 — เดิมช่องนี้เป็น ui.TextInput สองช่องที่พิมพ์สตริงอิสระ ("YYYY-MM-DD HH:mm")
        ไม่มีปฏิทินให้เลือกและไม่มีการตรวจลำดับเลย เจ้าของขอปฏิทินจริงตรง ๆ — ยืมจาก DS ของแต่ละ
        เวอร์ชัน (ui.DatePicker/ui.TimePicker) แทนวาดเอง ไม่ก็อปสีปฏิทินของ LINE (อาทิตย์แดง/เสาร์ฟ้า/
        วันที่เลือกเขียว ใน docs/files/example-ui/) เพราะปฏิทินนี้อยู่ใน Strapi ควรหน้าตาแบบ Strapi
        เจ้าของขอ "พฤติกรรม" (ปฏิทินแทนพิมพ์สตริง) ไม่ใช่ "ผิว" — ห้ามมีใคร "แก้" ให้เหมือน LINE ทีหลัง

        รูปทรงตาม LINE ตรง ๆ (docs/files/example-ui/): วันที่ + เวลาแยกกันคนละช่องต่อฝั่ง (4 ช่อง
        รวม) สองแถว (เริ่ม/สิ้นสุด) คั่นด้วย "~" ปุ่ม Clear เดิมยังอยู่
      */}
      {/*
        Task 14b item 1 — วาดด้วย `ui.RadioGroup`/`ui.Radio` ของ port ไม่ใช่ design system ตรง ๆ
        (packages/ui ไม่เคย import DS เลย — ดูหัวไฟล์ port.ts) สองตัวเลือกเสมอ ไม่ใช่ checkbox
        "เฉพาะสมาชิก" เพราะค่านี้เป็น enum สองค่าที่ทั้งคู่มีความหมายชัดเจนในตัว ไม่ใช่ธงเปิด/ปิด

        ใช้คีย์ `audience.all` / `audience.members` ชุดเดียวกับคอลัมน์ Audience ของหน้ารายการ
        (`RichMenuList`) ตั้งใจ — คนที่ตั้งค่าตรงนี้กับคนที่อ่านตารางต้องเห็นคำเดียวกันเป๊ะ
      */}
      <ui.RadioGroup
        name="audience"
        label={t('editor.audience')}
        value={value.audience}
        // ค่าที่กลับมาเป็น string ตามสัญญาของ port (adapter ไม่รู้จัก union ของเรา) — เทียบกับ
        // 'members' ตรง ๆ แทนการ cast เพื่อให้ค่าแปลกปลอมตกไปที่ 'all' แทนที่จะเล็ดลอดเข้า state
        // (แพทเทิร์นเดียวกับ `ChatBarSettings`)
        onChange={(next) => set('audience', next === 'members' ? 'members' : 'all')}
      >
        <ui.Radio value="all">{t('audience.all')}</ui.Radio>
        <ui.Radio value="members">{t('audience.members')}</ui.Radio>
      </ui.RadioGroup>

      <ui.Typography variant="omega">{t('editor.displayPeriod')}</ui.Typography>
      <ui.Flex direction="column" gap={2}>
        <ui.Flex gap={2} alignItems="flex-end">
          <ui.DatePicker
            name="startDate"
            label={t('editor.displayPeriod.startDate')}
            value={start.date}
            onChange={(date) => set('startAt', combineDisplayAt(date, start.time))}
            {...(errors?.startAt === undefined ? {} : { error: errors.startAt })}
          />
          <ui.TimePicker
            name="startTime"
            label={t('editor.displayPeriod.startTime')}
            value={start.time}
            onChange={(time) => set('startAt', combineDisplayAt(start.date, time))}
          />
          {/* ตัวคั่นแบบ "ช่วง" — LINE เองก็ใช้ "~" ตัวเดียวกันระหว่างสองแถวนี้พอดี ไม่ใช่ตกแต่งล้วน
              จึงไม่ซ่อนจาก screen reader (คนละกรณีกับชิ้นตกแต่งกรอบโทรศัพท์ใน Preview.tsx) */}
          <ui.Typography variant="omega" textColor="neutral600">~</ui.Typography>
        </ui.Flex>
        <ui.Flex gap={2} alignItems="flex-end">
          <ui.DatePicker
            name="endDate"
            label={t('editor.displayPeriod.endDate')}
            value={end.date}
            onChange={(date) => set('endAt', combineDisplayAt(date, end.time))}
            {...(errors?.endAt === undefined ? {} : { error: errors.endAt })}
          />
          <ui.TimePicker
            name="endTime"
            label={t('editor.displayPeriod.endTime')}
            value={end.time}
            onChange={(time) => set('endAt', combineDisplayAt(end.date, time))}
          />
          <ui.Button variant="secondary" testId="clear-period" onClick={() => onChange({ ...value, startAt: '', endAt: '' })}>
            {t('common.clear')}
          </ui.Button>
        </ui.Flex>
      </ui.Flex>
    </ui.Flex>
  )
}
