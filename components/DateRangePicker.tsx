'use client';

import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, startOfYesterday, endOfYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: 'Hoje', getValue: () => ({ start: new Date(), end: new Date() }) },
  { label: 'Ontem', getValue: () => ({ start: startOfYesterday(), end: endOfYesterday() }) },
  { label: 'Últimos 7 dias', getValue: () => ({ start: subDays(new Date(), 7), end: new Date() }) },
  { label: 'Últimos 30 dias', getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }) },
  { label: 'Este Mês', getValue: () => ({ start: startOfMonth(new Date()), end: new Date() }) },
  { label: 'Mês Passado', getValue: () => {
    const lastMonth = subDays(startOfMonth(new Date()), 1);
    return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
  }},
];

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm hover:border-primary transition-all text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        <Calendar className="size-4 text-primary" />
        <span>{value.label}</span>
        <span className="text-slate-400 text-xs font-normal ml-1">
          ({format(value.start, 'dd/MM', { locale: ptBR })} - {format(value.end, 'dd/MM', { locale: ptBR })})
        </span>
        <ChevronDown className={`size-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-30" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-40 py-2 animate-in fade-in zoom-in-95 duration-200">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  const range = preset.getValue();
                  onChange({ ...range, label: preset.label });
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  value.label === preset.label ? 'text-primary font-bold bg-primary/5' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
