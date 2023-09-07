export default function playcount(plays: number): string {
  const abs = Math.abs(plays);
  const sign = plays < 0 ? "-" : "";

  if (abs < 1000) return `${plays}`;

  const units = ["K", "M", "B"];
  const unitIndex = Math.min(Math.floor(Math.log10(abs) / 3), units.length) - 1;

  const value = abs / 10 ** ((unitIndex + 1) * 3);
  const precision = value >= 100 ? 0 : 1;

  return `${sign}${value.toFixed(precision)}${units[unitIndex]}`;
}
