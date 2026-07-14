'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { PIPELINE_STAGES } from '@/types';
import type { PipelineStatus } from '@/types';

export interface SalesFilters {
    search: string;
    stage: PipelineStatus | 'all';
    event: string | 'all';
    sort: 'urgent' | 'newest' | 'revenue';
}

export const DEFAULT_FILTERS: SalesFilters = {
    search: '',
    stage: 'all',
    event: 'all',
    sort: 'urgent',
};

const ACTIVE_STAGES = PIPELINE_STAGES.filter((s) => s !== 'Won' && s !== 'Lost');

interface Props {
    filters: SalesFilters;
    onChange: (f: SalesFilters) => void;
    eventOptions: string[];
    children?: React.ReactNode;
}

export function SalesFilterBar({ filters, onChange, eventOptions, children }: Props) {
    const update = (patch: Partial<SalesFilters>) => onChange({ ...filters, ...patch });
    const hasActiveFilter =
        filters.search.trim() !== '' || filters.stage !== 'all' || filters.event !== 'all' || filters.sort !== 'urgent';

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Cari nama / perusahaan..."
                    value={filters.search}
                    onChange={(e) => update({ search: e.target.value })}
                    className="pl-8 h-9"
                />
            </div>

            <Select value={filters.stage} onValueChange={(v) => update({ stage: v as SalesFilters['stage'] })}>
                <SelectTrigger className="w-[150px] h-9">
                    <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Semua Stage</SelectItem>
                    {ACTIVE_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                            {s}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={filters.event} onValueChange={(v) => update({ event: v })}>
                <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Event" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Semua Event</SelectItem>
                    {eventOptions.map((e) => (
                        <SelectItem key={e} value={e}>
                            {e}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={filters.sort} onValueChange={(v) => update({ sort: v as SalesFilters['sort'] })}>
                <SelectTrigger className="w-[150px] h-9">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="urgent">Paling Urgent</SelectItem>
                    <SelectItem value="newest">Terbaru</SelectItem>
                    <SelectItem value="revenue">Revenue Tertinggi</SelectItem>
                </SelectContent>
            </Select>

            {hasActiveFilter && (
                <Button variant="ghost" size="sm" className="h-9 px-2 text-xs text-muted-foreground" onClick={() => onChange(DEFAULT_FILTERS)}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    Reset
                </Button>
            )}

            {children && <div className="ml-auto">{children}</div>}
        </div>
    );
}
