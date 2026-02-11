import { describe, it, expect } from 'vitest';
import { countFiveElements } from '../five-elements';
import type { FourPillars } from '../types';

describe('countFiveElements', () => {
  it('counts five elements from four pillars', () => {
    const fourPillars: FourPillars = {
      year: {
        ganZhi: '戊寅',
        tianGan: { name: '戊', wuXing: '土', yinYang: '阳', shiShen: '劫财' },
        diZhi: { name: '寅', wuXing: '木', yinYang: '阳', cangGan: [] },
        naYin: '城头土',
      },
      month: {
        ganZhi: '己未',
        tianGan: { name: '己', wuXing: '土', yinYang: '阴', shiShen: '比肩' },
        diZhi: { name: '未', wuXing: '土', yinYang: '阴', cangGan: [] },
        naYin: '天上火',
      },
      day: {
        ganZhi: '己卯',
        tianGan: { name: '己', wuXing: '土', yinYang: '阴' },
        diZhi: { name: '卯', wuXing: '木', yinYang: '阴', cangGan: [] },
        naYin: '城头土',
      },
      hour: {
        ganZhi: '辛未',
        tianGan: { name: '辛', wuXing: '金', yinYang: '阴', shiShen: '食神' },
        diZhi: { name: '未', wuXing: '土', yinYang: '阴', cangGan: [] },
        naYin: '路旁土',
      },
    };

    const result = countFiveElements(fourPillars);

    expect(result).toEqual({
      wood: 2,  // 寅 + 卯
      fire: 0,
      earth: 5, // 戊 + 未 + 己 + 己 + 未
      metal: 1, // 辛
      water: 0,
    });
  });
});
