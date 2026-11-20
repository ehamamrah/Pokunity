'use client';

import { useId } from 'react';
import { cn } from '@/shared/lib/cn';
import { PAYMENT_TEST_TOKENS, type PaymentTestToken } from '../model/payment-methods';

type TokenValue = PaymentTestToken['token'];

function OptionCopy({ option }: { option: PaymentTestToken }) {
  return (
    <>
      <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
      <span className="block text-xs text-slate-600">{option.detail}</span>
      <span className="mt-0.5 block font-mono text-[11px] text-slate-500">{option.token}</span>
    </>
  );
}

interface PaymentOptionProps {
  option: PaymentTestToken;
  name: string;
  selected: boolean;
  onSelect: (token: TokenValue) => void;
}

function PaymentOption({ option, name, selected, onSelect }: PaymentOptionProps) {
  const inputId = useId();
  return (
    <div className={cn('flex items-start gap-3 rounded-xl p-3 ring-1 transition', selected ? 'bg-teal-50 ring-2 ring-teal-700' : 'bg-white ring-slate-200 hover:ring-teal-500')}>
      <input id={inputId} type="radio" name={name} value={option.token} checked={selected} onChange={() => onSelect(option.token)} className="mt-1 size-4 accent-teal-700" />
      <label htmlFor={inputId} className="cursor-pointer">
        <OptionCopy option={option} />
      </label>
    </div>
  );
}

interface PaymentMethodPickerProps {
  value: TokenValue;
  disabled: boolean;
  onChange: (token: TokenValue) => void;
}

/** Radio group of simulated provider tokens. The copy states plainly that this is a test provider. */
export function PaymentMethodPicker({ value, disabled, onChange }: PaymentMethodPickerProps) {
  const groupName = `payment-${useId()}`;
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="text-sm font-semibold text-slate-900">Payment method (simulated provider)</legend>
      <p className="text-xs text-slate-500">Test tokens only. No real card is charged.</p>
      <div className="grid gap-2">
        {PAYMENT_TEST_TOKENS.map((option) => (
          <PaymentOption key={option.token} option={option} name={groupName} selected={value === option.token} onSelect={onChange} />
        ))}
      </div>
    </fieldset>
  );
}
