"use client";

import { type ComponentProps, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseNumericInput } from "@/lib/numeric-input";

type NumericInputProps = Omit<
  ComponentProps<typeof Input>,
  "defaultValue" | "onChange" | "type" | "value"
> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function NumericInput({
  value,
  onValueChange,
  onBlur,
  ...props
}: NumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      {...props}
      type="number"
      value={draft ?? value}
      onChange={(event) => {
        const nextDraft = event.target.value;
        const parsed = parseNumericInput(nextDraft);
        setDraft(nextDraft);
        if (typeof parsed === "number" && Number.isFinite(parsed)) {
          onValueChange(parsed);
        }
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}
