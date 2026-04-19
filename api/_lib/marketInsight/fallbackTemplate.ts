// Deterministic Estonian/English templates for when Gemini fails, returns
// invalid JSON, or trips the forbidden-phrase guard. We still ship a row so
// the drawer never goes blank — but the text is 100% rule-based, no LLM.

import type { FuelSignal } from './computeSignal';

const PCT = (n: number) => {
  const abs = Math.abs(n) * 100;
  const sign = n >= 0 ? '+' : '-';
  return `${sign}${abs.toFixed(1)}%`;
};

function signalPhraseEt(s: FuelSignal['signal']): string {
  switch (s) {
    case 'buy_now': return 'osta nüüd';
    case 'wait':    return 'oota paar päeva';
    case 'hold':    return 'oota';
    case 'neutral': return 'turg on rahulik';
  }
}

function signalPhraseEn(s: FuelSignal['signal']): string {
  switch (s) {
    case 'buy_now': return 'buy now';
    case 'wait':    return 'wait a few days';
    case 'hold':    return 'hold';
    case 'neutral': return 'market is calm';
  }
}

export function buildFallbackText(
  diesel: FuelSignal,
  gasoline: FuelSignal,
): { headline_et: string; headline_en: string; content_et: string; content_en: string } {
  // Pick the more "urgent" fuel for the headline (buy_now > wait > hold > neutral).
  const rank: Record<FuelSignal['signal'], number> = {
    buy_now: 3, wait: 2, hold: 1, neutral: 0,
  };
  const lead = rank[diesel.signal] >= rank[gasoline.signal] ? diesel : gasoline;
  const leadName = lead === diesel ? 'Diisel' : 'Bensiin 95';
  const leadNameEn = lead === diesel ? 'Diesel' : 'Petrol 95';

  const headline_et = `${leadName}: ${signalPhraseEt(lead.signal)}`;
  const headline_en = `${leadNameEn}: ${signalPhraseEn(lead.signal)}`;

  const content_et = [
    `Diisel — ${signalPhraseEt(diesel.signal)}. Hulgihind ${PCT(diesel.wholesaleDelta7d)} nädalas, pump ${PCT(diesel.pumpDelta7d)}.`,
    `Bensiin 95 — ${signalPhraseEt(gasoline.signal)}. Hulgihind ${PCT(gasoline.wholesaleDelta7d)} nädalas, pump ${PCT(gasoline.pumpDelta7d)}.`,
    `Signaal põhineb Kyts-i andmetel ja globaalsetel turgudel. Põhjuseid uudistest me ei oletand.`,
  ].join('\n\n');

  const content_en = [
    `Diesel — ${signalPhraseEn(diesel.signal)}. Wholesale ${PCT(diesel.wholesaleDelta7d)} this week, pump ${PCT(diesel.pumpDelta7d)}.`,
    `Petrol 95 — ${signalPhraseEn(gasoline.signal)}. Wholesale ${PCT(gasoline.wholesaleDelta7d)} this week, pump ${PCT(gasoline.pumpDelta7d)}.`,
    `Signal is derived from Kyts data and global markets. We do not infer news-based causes here.`,
  ].join('\n\n');

  return { headline_et, headline_en, content_et, content_en };
}
