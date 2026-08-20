import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyActionForm } from '../src/action-form.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ActionForm } from '../src/components/ActionForm.js'

function setup(value = emptyActionForm(), aliasOptions: string[] = ['tab-a', 'tab-b']) {
  const onChange = vi.fn()
  render(
    <PortProvider value={createStubPort({ t: (k) => k })}>
      <ActionForm value={value} onChange={onChange} aliasOptions={aliasOptions} />
    </PortProvider>,
  )
  return { onChange }
}

describe('ActionForm', () => {
  it('แสดงช่อง text เมื่อชนิดเป็น message', () => {
    setup({ ...emptyActionForm(), type: 'message' })
    expect(screen.getByLabelText('action.field.text')).toBeInTheDocument()
    expect(screen.queryByLabelText('action.field.uri')).not.toBeInTheDocument()
  })

  it('แสดง uri และ altUri เมื่อชนิดเป็น uri', () => {
    setup({ ...emptyActionForm(), type: 'uri' })
    expect(screen.getByLabelText('action.field.uri')).toBeInTheDocument()
    expect(screen.getByLabelText('action.field.altUri')).toBeInTheDocument()
  })

  it('แสดง data และ displayText เมื่อชนิดเป็น postback', () => {
    setup({ ...emptyActionForm(), type: 'postback' })
    expect(screen.getByLabelText('action.field.data')).toBeInTheDocument()
    expect(screen.getByLabelText('action.field.displayText')).toBeInTheDocument()
  })

  it('richmenuswitch เลือกปลายทางจาก alias ที่มีอยู่ ไม่ใช่พิมพ์ id เอง', () => {
    setup({ ...emptyActionForm(), type: 'richmenuswitch' })
    const select = screen.getByLabelText('action.field.richMenuAliasId')
    expect(select.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: 'tab-a' })).toBeInTheDocument()
  })

  // สเปก §5.4 — สลับชนิดแล้วต้องไม่ล้างสิ่งที่พิมพ์ไว้
  it('สลับชนิดแล้วค่าที่พิมพ์ไว้ในช่องอื่นยังอยู่', () => {
    const { onChange } = setup({ ...emptyActionForm(), type: 'uri', uri: 'https://a.test' })
    fireEvent.change(screen.getByLabelText('action.field.type'), { target: { value: 'message' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message', uri: 'https://a.test' }),
    )
  })

  it('บอกว่ารับ scheme อะไรได้บ้างในช่อง uri', () => {
    setup({ ...emptyActionForm(), type: 'uri' })
    expect(screen.getByText(/https.*http.*tel.*line/)).toBeInTheDocument()
  })

  it('จำกัด label ไว้ที่ 20 ตัวตามสเปก LINE', () => {
    setup()
    expect(screen.getByLabelText('action.field.label')).toHaveAttribute('maxlength', '20')
  })
})
