export type Step =
  | { kind: 'validate' }
  | { kind: 'create' }
  | { kind: 'uploadImage' }
  | { kind: 'upsertAlias'; aliasId: string }
  | { kind: 'setDefault' }
  | { kind: 'deleteOld'; lineRichMenuId: string }

export type Compensation = { kind: 'deleteCreated' }

export interface PublishInput {
  aliasId?: string
  setAsDefault: boolean
  previousLineRichMenuId?: string
}

/**
 * คืนลำดับขั้นของการ publish โดยไม่ยิง network เอง
 * ผู้เรียกเป็นคนรันทีละขั้น และเรียก compensate() เมื่อขั้นใดล้มเหลว
 */
export function plan(input: PublishInput): Step[] {
  const steps: Step[] = [{ kind: 'validate' }, { kind: 'create' }, { kind: 'uploadImage' }]
  if (input.aliasId) steps.push({ kind: 'upsertAlias', aliasId: input.aliasId })
  if (input.setAsDefault) steps.push({ kind: 'setDefault' })
  if (input.previousLineRichMenuId) {
    steps.push({ kind: 'deleteOld', lineRichMenuId: input.previousLineRichMenuId })
  }
  return steps
}

/**
 * ถ้าสร้างเมนูบน LINE ไปแล้วแต่ขั้นถัดไปล้ม ต้องลบทิ้งเสมอ
 * ไม่งั้นจะเหลือเมนูกำพร้าที่กินโควตาของ channel
 */
export function compensate(completed: readonly Step[]): Compensation[] {
  return completed.some((s) => s.kind === 'create') ? [{ kind: 'deleteCreated' }] : []
}
