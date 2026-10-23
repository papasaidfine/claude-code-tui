import { expect, test } from 'claude-code/testing'

import { SHADE, bar, level, splitPath, tokens, until, windowLabel } from '../hooks/format'

test('splitPath names the folder and its parent under ~', async () => {
  expect(splitPath('/home/u/src/proj', '/home/u')).toEqual({ dir: 'proj', parent: '~/src' })
  expect(splitPath('/home/u/proj', '/home/u')).toEqual({ dir: 'proj', parent: '~' })
  expect(splitPath('/home/u', '/home/u')).toEqual({ dir: '~', parent: '' })
  expect(splitPath('/srv/app', '/home/u')).toEqual({ dir: 'app', parent: '/srv' })
  expect(splitPath('/', undefined)).toEqual({ dir: '/', parent: '' })
})

test('bar splits five thin cells by percent', async () => {
  expect(bar(null)).toEqual({ filled: '', empty: '─────' })
  expect(bar(0)).toEqual({ filled: '', empty: '─────' })
  expect(bar(24)).toEqual({ filled: '━', empty: '────' })
  expect(bar(50)).toEqual({ filled: '━━━', empty: '──' })
  expect(bar(130)).toEqual({ filled: '━━━━━', empty: '' })
})

test('bar draws shaded cells when asked', async () => {
  expect(bar(24, SHADE)).toEqual({ filled: '▓', empty: '░░░░' })
})

test('tokens abbreviates thousands', async () => {
  expect(tokens(950)).toBe('950')
  expect(tokens(3140)).toBe('3.1k')
  expect(tokens(154300)).toBe('154k')
  expect(tokens(1_200_000)).toBe('1.2M')
})

test('until counts down to a reset', async () => {
  const now = Date.parse('2026-10-23T10:00:00Z')
  expect(until('2026-10-23T10:45:00Z', now)).toBe('45m')
  expect(until('2026-10-23T12:14:00Z', now)).toBe('2h14m')
  expect(until('2026-10-26T15:30:00Z', now)).toBe('3d5h')
  expect(until('2026-10-23T09:00:00Z', now)).toBe('now')
  expect(until('not a date', now)).toBeUndefined()
})

test('windowLabel shortens the known windows', async () => {
  expect(windowLabel('five_hour')).toBe('5h')
  expect(windowLabel('seven_day')).toBe('7d')
  expect(windowLabel('spend_limit')).toBe('spend')
  expect(windowLabel('other_thing')).toBe('other_thing')
})

test('level warns from 80% and errs from 95%', async () => {
  expect(level(79.9)).toBeUndefined()
  expect(level(80)).toBe('warning')
  expect(level(95)).toBe('error')
})
