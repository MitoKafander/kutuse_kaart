// Deterministic templates for every app language, used when Gemini fails,
// returns invalid JSON, or trips the forbidden-phrase guard. We still ship a
// row so the drawer never goes blank — but the text is 100% rule-based.
//
// Each translation preserves the same two-paragraph shape the Gemini prompt
// asks for, so users of every locale see structurally similar content.

import type { FuelSignal } from './computeSignal.js';

const PCT = (n: number) => {
  const abs = Math.abs(n) * 100;
  const sign = n >= 0 ? '+' : '-';
  return `${sign}${abs.toFixed(1)}%`;
};

type SignalPhrases = Record<FuelSignal['signal'], string>;

// Phrases match the canonical signal pills in src/i18n/locales/*.json (lowercased
// for inline sentence use). If you edit either side, edit both — the fallback
// should read the same as the pill the user sees in the drawer header.
const PHRASES: Record<'et' | 'en' | 'ru' | 'fi' | 'lv' | 'lt', SignalPhrases> = {
  et: { buy_now: 'osta nüüd',     wait: 'oota 3-5 päeva',   hold: 'võid osta',         neutral: 'turg on rahulik' },
  en: { buy_now: 'buy now',       wait: 'wait 3-5 days',    hold: 'OK to buy',         neutral: 'market is calm' },
  ru: { buy_now: 'заправляйся',   wait: 'жди 3-5 дней',     hold: 'можно заправиться', neutral: 'рынок спокоен' },
  fi: { buy_now: 'tankkaa nyt',   wait: 'odota 3-5 pv',     hold: 'voit tankata',      neutral: 'markkinat rauhalliset' },
  lv: { buy_now: 'uzpildi tagad', wait: 'gaidi 3-5 dienas', hold: 'vari uzpildīt',     neutral: 'tirgus ir mierīgs' },
  lt: { buy_now: 'pilk dabar',    wait: 'lauk 3-5 dienas',  hold: 'gali pildyti',      neutral: 'rinka rami' },
};

const FUEL_NAMES = {
  et: { diesel: 'Diisel', gasoline: 'Bensiin 95' },
  en: { diesel: 'Diesel', gasoline: 'Petrol 95' },
  ru: { diesel: 'Дизель', gasoline: 'Бензин 95' },
  fi: { diesel: 'Diesel', gasoline: 'Bensiini 95' },
  lv: { diesel: 'Dīzelis', gasoline: 'Benzīns 95' },
  lt: { diesel: 'Dyzelinas', gasoline: 'Benzinas 95' },
};

const DISCLAIMER = {
  et: 'Signaal põhineb Kyts-i andmetel ja globaalsetel turgudel. Põhjuseid uudistest me ei oleta.',
  en: 'Signal is derived from Kyts data and global markets. We do not infer news-based causes here.',
  ru: 'Сигнал основан на данных Kyts и мировых рынках. Причины из новостей мы не додумываем.',
  fi: 'Signaali perustuu Kyts-tietoihin ja maailmanmarkkinoihin. Syitä uutisista emme arvaile.',
  lv: 'Signāls balstās uz Kyts datiem un pasaules tirgiem. Iemeslus no ziņām neminam.',
  lt: 'Signalas remiasi Kyts duomenimis ir pasaulio rinkomis. Priežasčių iš naujienų neišvedame.',
};

const WEEK_WORD = {
  et: 'nädalas', en: 'this week', ru: 'за неделю', fi: 'viikossa', lv: 'nedēļā', lt: 'per savaitę',
};
const WHOLESALE_WORD = {
  et: 'Hulgihind', en: 'Wholesale', ru: 'Опт', fi: 'Tukku', lv: 'Vairumā', lt: 'Didmena',
};
const PUMP_WORD = {
  et: 'pump', en: 'pump', ru: 'колонка', fi: 'pumppu', lv: 'kolonna', lt: 'kolonėlė',
};

type Lang = keyof typeof PHRASES;
const LANGS: Lang[] = ['et', 'en', 'ru', 'fi', 'lv', 'lt'];

type FallbackOutput = {
  [K in `${'headline' | 'content'}_${Lang}`]: string;
};

export function buildFallbackText(
  diesel: FuelSignal,
  gasoline: FuelSignal,
): FallbackOutput {
  // Pick the more "urgent" fuel for the headline (buy_now > wait > hold > neutral).
  const rank: Record<FuelSignal['signal'], number> = {
    buy_now: 3, wait: 2, hold: 1, neutral: 0,
  };
  const lead = rank[diesel.signal] >= rank[gasoline.signal] ? diesel : gasoline;
  const leadIsDiesel = lead === diesel;

  const out: Partial<FallbackOutput> = {};
  for (const lang of LANGS) {
    const phrases = PHRASES[lang];
    const fuels = FUEL_NAMES[lang];
    const leadName = leadIsDiesel ? fuels.diesel : fuels.gasoline;
    const wholesale = WHOLESALE_WORD[lang];
    const pump = PUMP_WORD[lang];
    const week = WEEK_WORD[lang];

    out[`headline_${lang}`] = `${leadName}: ${phrases[lead.signal]}`;
    out[`content_${lang}`] = [
      `${fuels.diesel} — ${phrases[diesel.signal]}. ${wholesale} ${PCT(diesel.wholesaleDelta7d)} ${week}, ${pump} ${PCT(diesel.pumpDelta7d)}.`,
      `${fuels.gasoline} — ${phrases[gasoline.signal]}. ${wholesale} ${PCT(gasoline.wholesaleDelta7d)} ${week}, ${pump} ${PCT(gasoline.pumpDelta7d)}.`,
      DISCLAIMER[lang],
    ].join('\n\n');
  }
  return out as FallbackOutput;
}
