import { expect, test } from 'claude-code/testing'

import { ICON_SVG, meterSvg, meterWidth } from '../hooks/svg'

test('meterWidth fills by percent, never thinner than its rounded ends', async () => {
  expect(meterWidth(null)).toBe(0)
  expect(meterWidth(0)).toBe(0)
  expect(meterWidth(1)).toBe(6)
  expect(meterWidth(50)).toBe(20)
  expect(meterWidth(130)).toBe(40)
})

test('meterSvg draws a track and a fill in the given color', async () => {
  const svg = meterSvg(50, '#123456')
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('width="20"')
  expect(svg).toContain('fill="#123456"')
  expect(meterSvg(0, '#123456')).not.toContain('#123456')
})

test('each icon is an svg document', async () => {
  for (const icon of Object.values(ICON_SVG)) expect(icon.startsWith('<svg')).toBe(true)
})
