import {
  SolarTime,
  LunarHour,
  Gender,
  ChildLimit,
  LunarSect2EightCharProvider,
  type SixtyCycle,
  type HeavenStem,
} from 'tyme4ts';
import { calculateRelation, getShen } from 'cantian-tymext';
import { countFiveElements } from './five-elements';
import type { BaziInput, BaziResult, Pillar, DecadeFortune } from './types';

// Use "early zi hour = current day" algorithm (more common)
LunarHour.provider = new LunarSect2EightCharProvider();

export function calculateBazi(input: BaziInput): BaziResult {
  const { year, month, day, hour, minute = 0, gender = 1 } = input;

  // 1. Solar date -> SolarTime -> LunarHour -> EightChar
  const solarTime = SolarTime.fromYmdHms(year, month, day, hour, minute, 0);
  const lunarHour = solarTime.getLunarHour();
  const eightChar = lunarHour.getEightChar();

  // 2. Get four pillars
  const yearPillar = eightChar.getYear();
  const monthPillar = eightChar.getMonth();
  const dayPillar = eightChar.getDay();
  const hourPillar = eightChar.getHour();

  const me = dayPillar.getHeavenStem(); // Day Master

  // 3. Build detailed pillar data
  const fourPillars = {
    year: buildPillarDetail(yearPillar, me, 'year'),
    month: buildPillarDetail(monthPillar, me, 'month'),
    day: buildPillarDetail(dayPillar, me, 'day'),
    hour: buildPillarDetail(hourPillar, me, 'hour'),
  };

  // 4. Spirit Sha (gods)
  const baziStr = eightChar.toString();
  let gods: Record<string, string[]> = {};
  try {
    gods = getShen(baziStr, gender);
  } catch {
    // cantian-tymext may throw, ignore
  }

  // 5. Punishment/Clash/Combination relations
  let relations: Record<string, unknown> = {};
  try {
    relations = calculateRelation({
      year: yearPillar.toString(),
      month: monthPillar.toString(),
      day: dayPillar.toString(),
      hour: hourPillar.toString(),
    });
  } catch {
    // Ignore exception
  }

  // 6. Decade fortunes
  const genderEnum = gender === 1 ? Gender.MALE : Gender.FEMALE;
  const decadeFortunes = buildDecadeFortunes(solarTime, genderEnum);

  // 7. Five elements count
  const fiveElements = countFiveElements(fourPillars);

  // 8. Basic info
  const lunar = lunarHour.getLunarDay();

  return {
    solar: `${year}-${month}-${day} ${hour}:${minute.toString().padStart(2, '0')}`,
    lunar: lunar.toString(),
    bazi: baziStr,
    zodiac: lunar.getYearSixtyCycle().getEarthBranch().getZodiac().getName(),
    dayMaster: me.getName(),
    fourPillars,
    fiveElements,
    gods,
    decadeFortunes,
    relations,
  };
}

function buildPillarDetail(
  pillar: SixtyCycle,
  me: HeavenStem,
  position: 'year' | 'month' | 'day' | 'hour'
): Pillar {
  const stem = pillar.getHeavenStem();
  const branch = pillar.getEarthBranch();

  return {
    ganZhi: pillar.toString(),
    tianGan: {
      name: stem.getName(),
      wuXing: stem.getElement().getName(),
      yinYang: stem.getYinYang() === 1 ? '阳' : '阴',
      shiShen: position !== 'day' ? me.getTenStar(stem).getName() : undefined,
    },
    diZhi: {
      name: branch.getName(),
      wuXing: branch.getElement().getName(),
      yinYang: branch.getYinYang() === 1 ? '阳' : '阴',
      cangGan: branch.getHideHeavenStems().map((hideHeavenStem) => {
        const h = hideHeavenStem.getHeavenStem();
        return {
          name: h.getName(),
          shiShen: me.getTenStar(h).getName(),
        };
      }),
    },
    naYin: pillar.getSound().getName(),
  };
}

function buildDecadeFortunes(
  solarTime: SolarTime,
  gender: Gender
): DecadeFortune[] {
  try {
    const childLimit = ChildLimit.fromSolarTime(solarTime, gender);
    const startFortune = childLimit.getStartDecadeFortune();
    const fortunes: DecadeFortune[] = [];

    let current = startFortune;
    for (let i = 0; i < 10; i++) {
      fortunes.push({
        ganZhi: current.getSixtyCycle().toString(),
        startYear: current.getStartLunarYear().getYear(),
        endYear: current.getEndLunarYear().getYear(),
        startAge: current.getStartAge(),
        endAge: current.getEndAge(),
      });
      current = current.next(1);
    }

    return fortunes;
  } catch {
    return [];
  }
}

export type { BaziInput, BaziResult } from './types';
