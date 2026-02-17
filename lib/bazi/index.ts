import type { HeavenStem, SixtyCycle } from 'tyme4ts'
import type { BaziInput, BaziResult, DecadeFortune, Pillar } from './types'
import { calculateRelation, getShen } from 'cantian-tymext'
import {
  ChildLimit,
  Gender,

  LunarHour,
  LunarSect2EightCharProvider,

  SolarTime,
} from 'tyme4ts'
import { countFiveElements } from './five-elements'

// Use "early zi hour = current day" algorithm (more common)
LunarHour.provider = new LunarSect2EightCharProvider()

export function calculateBazi(input: BaziInput): BaziResult {
  const { year, month, day, hour, minute = 0, gender = 1 } = input

  // 1. Solar date -> SolarTime -> LunarHour -> EightChar
  const solarTime = SolarTime.fromYmdHms(year, month, day, hour, minute, 0)
  const lunarHour = solarTime.getLunarHour()
  const eightChar = lunarHour.getEightChar()

  // 2. Get four pillars
  const yearPillar = eightChar.getYear()
  const monthPillar = eightChar.getMonth()
  const dayPillar = eightChar.getDay()
  const hourPillar = eightChar.getHour()

  const me = dayPillar.getHeavenStem() // Day Master

  // 3. Build detailed pillar data
  const fourPillars = {
    year: buildPillarDetail(yearPillar, me, 'year'),
    month: buildPillarDetail(monthPillar, me, 'month'),
    day: buildPillarDetail(dayPillar, me, 'day'),
    hour: buildPillarDetail(hourPillar, me, 'hour'),
  }

  // 4. Spirit Sha (gods)
  const baziStr = eightChar.toString()
  let gods: Record<'year' | 'month' | 'day' | 'hour', string[]> = { year: [], month: [], day: [], hour: [] }
  try {
    const rawGods = getShen(baziStr, gender)
    const keys = ['year', 'month', 'day', 'hour'] as const
    for (let i = 0; i < rawGods.length && i < 4; i++) {
      gods[keys[i]] = rawGods[i] ?? []
    }
  }
  catch {
    // cantian-tymext may throw, ignore
  }

  // 5. Punishment/Clash/Combination relations
  let relations: Record<string, unknown> = {}
  try {
    relations = calculateRelation({
      year: { 天干: yearPillar.getHeavenStem().getName(), 地支: yearPillar.getEarthBranch().getName() },
      month: { 天干: monthPillar.getHeavenStem().getName(), 地支: monthPillar.getEarthBranch().getName() },
      day: { 天干: dayPillar.getHeavenStem().getName(), 地支: dayPillar.getEarthBranch().getName() },
      hour: { 天干: hourPillar.getHeavenStem().getName(), 地支: hourPillar.getEarthBranch().getName() },
    })
  }
  catch {
    // Ignore exception
  }

  // 6. Decade fortunes
  const genderEnum = gender === 1 ? Gender.MAN : Gender.WOMAN
  const decadeFortunes = buildDecadeFortunes(solarTime, genderEnum)

  // 7. Five elements count
  const fiveElements = countFiveElements(fourPillars)

  // 8. Basic info
  const lunar = lunarHour.getLunarDay()

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
  }
}

function buildPillarDetail(
  pillar: SixtyCycle,
  me: HeavenStem,
  position: 'year' | 'month' | 'day' | 'hour',
): Pillar {
  const stem = pillar.getHeavenStem()
  const branch = pillar.getEarthBranch()

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
        const h = hideHeavenStem.getHeavenStem()
        return {
          name: h.getName(),
          shiShen: me.getTenStar(h).getName(),
        }
      }),
    },
    naYin: pillar.getSound().getName(),
  }
}

function buildDecadeFortunes(
  solarTime: SolarTime,
  gender: Gender,
): DecadeFortune[] {
  try {
    const childLimit = ChildLimit.fromSolarTime(solarTime, gender)
    const startFortune = childLimit.getStartDecadeFortune()
    const fortunes: DecadeFortune[] = []

    let current = startFortune
    for (let i = 0; i < 10; i++) {
      fortunes.push({
        ganZhi: current.getSixtyCycle().toString(),
        startYear: current.getStartLunarYear().getYear(),
        endYear: current.getEndLunarYear().getYear(),
        startAge: current.getStartAge(),
        endAge: current.getEndAge(),
      })
      current = current.next(1)
    }

    return fortunes
  }
  catch {
    return []
  }
}

export type { BaziInput, BaziResult } from './types'
