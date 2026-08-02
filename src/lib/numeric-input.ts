export type NumericInputValue = number | "";

export function parseNumericInput(value: string): NumericInputValue {
  return value === "" ? "" : Number(value);
}

export function isIntegerInRange(
  value: NumericInputValue,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}
