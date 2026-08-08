const pointFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function roundPoints(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatPoints(value: number) {
  return pointFormatter.format(roundPoints(value));
}
