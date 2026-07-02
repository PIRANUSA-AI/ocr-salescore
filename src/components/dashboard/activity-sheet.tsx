'use client';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Clock, Loader2, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { getActivityLogs } from "@/app/actions/activity";
import type { ActivityLog } from "@/types";
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';

const getInitials = (name: string) => {
    if (!name) return '??';
    const names = name.split(' ');
    if (names.length > 1) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export function ActivitySheet() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            getActivityLogs(30)
                .then(data => setLogs(data as ActivityLog[]))
                .catch(err => console.error("Failed to fetch activity logs:", err))
                .finally(() => setIsLoading(false));
        }
    }, [isOpen]);

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Clock className="h-5 w-5" />
                    <span className="sr-only">Buka Log Aktivitas</span>
                </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                    <SheetTitle>Monitor Aktivitas Sales</SheetTitle>
                    <SheetDescription>Tinjau log aktivitas terbaru dari tim sales Anda secara real-time.</SheetDescription>
                </SheetHeader>
                <div className="py-4 h-[calc(100vh-8rem)] overflow-y-auto">
                     {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : logs.length > 0 ? (
                        <div className="space-y-6 pr-4">
                            {logs.map(log => (
                                <div key={log.id} className="flex items-start gap-4">
                                    <Avatar className="h-10 w-10 border">
                                        <AvatarFallback>{getInitials(log.actorName)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <p className="text-sm">
                                            <span className="font-semibold text-foreground">{log.actorName}</span>
                                            {' '}
                                            {log.action}
                                            {' '}
                                            <span className="font-semibold text-primary">{log.targetName}</span>.
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: id })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center border-2 border-dashed rounded-lg">
                            <Zap className="h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">Belum Ada Aktivitas</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Aktivitas dari tim sales akan muncul di sini.</p>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
