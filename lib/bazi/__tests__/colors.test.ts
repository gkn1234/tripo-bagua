import { describe, expect, it } from 'vitest'
import { getWuXingColor } from '../colors'

describe('getWuXingColor', () => {
  it('returns green for 木', () => {
    expect(getWuXingColor('木')).toBe('oklch(0.55 0.15 155)')
  })

  it('returns red for 火', () => {
    expect(getWuXingColor('火')).toBe('oklch(0.55 0.18 25)')
  })

  it('returns yellow for 土', () => {
    expect(getWuXingColor('土')).toBe('oklch(0.6 0.14 85)')
  })

  it('returns gold for 金', () => {
    expect(getWuXingColor('金')).toBe('oklch(0.7 0.1 60)')
  })

  it('returns blue for 水', () => {
    expect(getWuXingColor('水')).toBe('oklch(0.5 0.14 240)')
  })

  it('returns muted-foreground for unknown', () => {
    expect(getWuXingColor('?')).toBe('oklch(0.65 0 0)')
  })
})
