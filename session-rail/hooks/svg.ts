// Drawings for surfaces with an Svg element. An Svg is drawn as an image, so it
// inherits no text color: every color here is spelled out, mid-tones that read on
// light and dark themes alike.

export const COLOR = {
  muted: '#8a8a8a',
  fill: '#5b8def',
  warning: '#e0a526',
  error: '#e5534b',
}

const METER = { width: 40, height: 6 }

export function meterWidth(percent: number | null): number {
  if (percent === null || percent <= 0) return 0
  const width = Math.min(METER.width, (percent / 100) * METER.width)
  return Math.round(Math.max(METER.height, width) * 10) / 10
}

export function meterSvg(percent: number | null, color: string): string {
  const { width, height } = METER
  const filled = meterWidth(percent)
  const r = height / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" rx="${r}" fill="${COLOR.muted}" fill-opacity="0.35"/>` +
    (filled > 0 ? `<rect width="${filled}" height="${height}" rx="${r}" fill="${color}"/>` : '') +
    `</svg>`
  )
}

const icon = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none" ` +
  `stroke="${COLOR.muted}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICON_SVG = {
  host: icon('<rect x="3" y="3.5" width="10" height="7" rx="1"/><path d="M1.5 12.5h13"/>'),
  folder: icon('<path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>'),
  branch: icon(
    '<circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11" cy="5.5" r="1.5"/>' +
      '<path d="M5 5v6"/><path d="M11 7c0 2.5-6 1.5-6 4"/>',
  ),
}

export const ICON_ALT = { host: 'computer', folder: 'folder', branch: 'branch' }
