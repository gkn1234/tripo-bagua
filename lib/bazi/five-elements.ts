import type { FourPillars, FiveElements } from './types';

const WUXING_MAP: Record<string, keyof FiveElements> = {
  '木': 'wood',
  '火': 'fire',
  '土': 'earth',
  '金': 'metal',
  '水': 'water',
};

export function countFiveElements(fourPillars: FourPillars): FiveElements {
  const counts: FiveElements = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };

  for (const pillar of Object.values(fourPillars)) {
    // Heavenly Stem element
    const stemElement = WUXING_MAP[pillar.tianGan.wuXing];
    if (stemElement) counts[stemElement]++;

    // Earthly Branch element
    const branchElement = WUXING_MAP[pillar.diZhi.wuXing];
    if (branchElement) counts[branchElement]++;
  }

  return counts;
}
