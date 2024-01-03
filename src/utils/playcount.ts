import i18n, { currentLocale } from "../i18n";

const UNIT_KEYS = ["numbers.thousand", "numbers.million", "numbers.billion"] as const;

export default function playcount(plays: number, locale: string = currentLocale()): string {
  const abs = Math.abs(plays);
  const sign = plays < 0 ? "-" : "";

  if (abs < 1000) return `${plays}`;

  const unitIndex = Math.min(Math.floor(Math.log10(abs) / 3), UNIT_KEYS.length) - 1;

  const value = abs / 10 ** ((unitIndex + 1) * 3);
  const precision = value >= 100 ? 0 : 1;
  const digits = new Intl.NumberFormat(locale, { minimumFractionDigits: precision, maximumFractionDigits: precision });

  return `${sign}${digits.format(value)}${i18n.t(UNIT_KEYS[unitIndex])}`;
}
