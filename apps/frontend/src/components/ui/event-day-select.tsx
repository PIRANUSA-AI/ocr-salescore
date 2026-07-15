'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EVENT_DAYS, eventDayDate, formatEventDay } from '@/types';

interface EventDaySelectProps {
    eventName: string;
    dayIndex: number;
    onDayChange: (idx: number) => void;
    className?: string;
}

export function EventDaySelect({ eventName, dayIndex, onDayChange, className }: EventDaySelectProps) {
    const days = EVENT_DAYS[eventName];
    if (!days || days.length === 0) return null;

    return (
        <div className={className}>
            <Label>Hari (Day) <span className="text-red-500">*</span></Label>
            <Select value={String(dayIndex)} onValueChange={(v) => onDayChange(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {days.map((dateStr, i) => (
                        <SelectItem key={i} value={String(i)}>
                            Day {i + 1} ({eventDayDate(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
                Tanggal: <span className="font-medium text-foreground">{formatEventDay(eventName, dayIndex) || '-'}</span>
            </p>
        </div>
    );
}
