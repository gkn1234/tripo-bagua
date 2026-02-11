import { describe, it, expect } from 'vitest';
import { calculateBazi } from '../index';

describe('calculateBazi', () => {
  it('calculates bazi for a known date', () => {
    // 1998-07-31 14:10 -> 戊寅 己未 己卯 辛未
    const result = calculateBazi({
      year: 1998,
      month: 7,
      day: 31,
      hour: 14,
      minute: 10,
      gender: 1,
    });

    expect(result.bazi).toBe('戊寅 己未 己卯 辛未');
    expect(result.zodiac).toBe('虎');
    expect(result.dayMaster).toBe('己');
    expect(result.fourPillars.year.ganZhi).toBe('戊寅');
    expect(result.fourPillars.month.ganZhi).toBe('己未');
    expect(result.fourPillars.day.ganZhi).toBe('己卯');
    expect(result.fourPillars.hour.ganZhi).toBe('辛未');
  });

  it('includes five elements count', () => {
    const result = calculateBazi({
      year: 1998,
      month: 7,
      day: 31,
      hour: 14,
      gender: 1,
    });

    expect(result.fiveElements).toBeDefined();
    expect(result.fiveElements.earth).toBeGreaterThan(0);
  });

  it('includes decade fortunes', () => {
    const result = calculateBazi({
      year: 1998,
      month: 7,
      day: 31,
      hour: 14,
      gender: 1,
    });

    expect(result.decadeFortunes).toBeDefined();
    expect(result.decadeFortunes.length).toBeGreaterThan(0);
  });
});
