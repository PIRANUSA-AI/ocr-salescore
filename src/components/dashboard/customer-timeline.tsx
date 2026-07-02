'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    CalendarDays,
    MessageSquare,
    Presentation,
    TrendingUp,
    UserPlus,
    FileText,
    Bot
} from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import type { Customer, ActivityLog, GenerationHistoryItem } from '@/types';

interface TimelineEvent {
    id: string;
    type: 'webinar' | 'activity' | 'note' | 'generation' | 'creation' | 'pipeline';
    title: string;
    description?: string;
    date: string;
    icon: React.ElementType;
    color: string;
}

interface CustomerTimelineProps {
    customer: Customer;
    activityLogs?: ActivityLog[];
}

export function CustomerTimeline({ customer, activityLogs = [] }: CustomerTimelineProps) {
    // Build timeline events from various sources
    const events: TimelineEvent[] = [];

    // 1. Customer Creation
    events.push({
        id: 'creation',
        type: 'creation',
        title: 'Pelanggan Dibuat',
        description: `Sumber: ${customer.acquisitionContext.source}${customer.acquisitionContext.eventName ? ` - ${customer.acquisitionContext.eventName}` : ''}`,
        date: customer.createdAt,
        icon: UserPlus,
        color: 'text-green-600'
    });

    // 2. Webinar History
    customer.webinarHistory?.forEach((webinar, idx) => {
        events.push({
            id: `webinar-${idx}`,
            type: 'webinar',
            title: 'Mengikuti Webinar',
            description: webinar.webinarTitle,
            date: customer.createdAt, // Ideally would have webinar date
            icon: Presentation,
            color: 'text-blue-600'
        });
    });

    // 3. Generation History (AI communications)
    customer.generationHistory?.forEach((gen, idx) => {
        events.push({
            id: `gen-${idx}`,
            type: 'generation',
            title: `AI ${gen.generationSource}`,
            description: `${gen.type === 'email' ? 'Email' : 'WhatsApp'}: ${gen.userInput?.text?.slice(0, 50) || 'Generated content'}...`,
            date: gen.createdAt,
            icon: Bot,
            color: 'text-purple-600'
        });
    });

    // 4. Activity Logs (from Firestore)
    activityLogs.forEach((log) => {
        events.push({
            id: log.id,
            type: 'activity',
            title: log.action,
            description: `Oleh: ${log.actorName}`,
            date: log.createdAt,
            icon: TrendingUp,
            color: 'text-orange-600'
        });
    });

    // 5. Manual Notes
    if (customer.notes?.manual) {
        events.push({
            id: 'manual-note',
            type: 'note',
            title: 'Catatan Manual',
            description: customer.notes.manual.slice(0, 100) + (customer.notes.manual.length > 100 ? '...' : ''),
            date: customer.updatedAt,
            icon: FileText,
            color: 'text-slate-600'
        });
    }

    // Sort by date (newest first)
    const sortedEvents = events.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Timeline Aktivitas
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[300px] pr-4">
                    {sortedEvents.length > 0 ? (
                        <div className="relative">
                            {/* Timeline Line */}
                            <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

                            {/* Timeline Events */}
                            <div className="space-y-4">
                                {sortedEvents.map((event) => (
                                    <div key={event.id} className="relative flex gap-4 pl-8">
                                        {/* Icon */}
                                        <div className={`absolute left-0 p-1.5 rounded-full bg-background border ${event.color}`}>
                                            <event.icon className="h-3 w-3" />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0 pb-2">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-sm font-medium">{event.title}</span>
                                                <Badge variant="outline" className="text-[10px] py-0">
                                                    {event.type}
                                                </Badge>
                                            </div>
                                            {event.description && (
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {event.description}
                                                </p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                {format(new Date(event.date), 'd MMM yyyy, HH:mm', { locale: id })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            Belum ada aktivitas tercatat.
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
