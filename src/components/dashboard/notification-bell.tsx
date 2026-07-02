'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { Notification } from '@/types';
import { markNotificationAsRead, markAllNotificationsAsRead } from '@/app/actions/notification';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

export function NotificationBell() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const prevUnreadCount = useRef(0);
    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (!user) return;

        // Real-time listener for notifications
        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', user.uid),
            // FireStore requires composite index for 'userId' + 'createdAt'. 
            // If checking 'isRead' too, simpler to just filter client side for 'limit' if index missing.
            // Let's rely on createdAt descending.
            orderBy('createdAt', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: Notification[] = [];
            let unread = 0;
            snapshot.forEach(doc => {
                const data = doc.data() as Omit<Notification, 'id'>;
                if (!data.isRead) unread++;
                items.push({ ...data, id: doc.id });
            });
            setNotifications(items);
            setUnreadCount(unread);

            // Trigger toast when NEW notification arrives (not on initial load)
            if (!isInitialLoad.current && unread > prevUnreadCount.current && items.length > 0) {
                const latestNotification = items[0]; // Most recent
                if (!latestNotification.isRead) {
                    toast({
                        title: `🔔 ${latestNotification.title}`,
                        description: latestNotification.message,
                    });
                }
            }

            prevUnreadCount.current = unread;
            isInitialLoad.current = false;
        }, (error) => {
            console.error("Error fetching notifications:", error);
            // Optionally set an error state or just silence it to prevent crash
        });

        return () => unsubscribe();
    }, [user, toast]);

    const handleMarkAsRead = async (notificationId: string) => {
        await markNotificationAsRead(notificationId);
    };

    const handleMarkAllRead = async () => {
        if (!user) return;
        await markAllNotificationsAsRead(user.uid);
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-600 ring-2 ring-background" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-4 border-b">
                    <h4 className="font-semibold text-sm">Notifikasi</h4>
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" className="h-auto text-xs text-primary px-2" onClick={handleMarkAllRead}>
                            Tandai semua dibaca
                        </Button>
                    )}
                </div>
                <ScrollArea className="h-[300px]">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">Belum ada notifikasi.</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((item) => (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "p-4 hover:bg-muted/50 transition-colors relative group",
                                        !item.isRead && "bg-muted/30"
                                    )}
                                >
                                    <div className="flex gap-3 items-start">
                                        <div className={cn(
                                            "h-2 w-2 mt-2 rounded-full shrink-0",
                                            item.type === 'deal_won' ? "bg-green-500" :
                                                item.type === 'error' ? "bg-red-500" :
                                                    item.type === 'warning' ? "bg-yellow-500" :
                                                        "bg-blue-500"
                                        )} />
                                        <div className="flex-1 space-y-1">
                                            <p className="text-sm font-medium leading-none">{item.title}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-2">{item.message}</p>
                                            <p className="text-[10px] text-muted-foreground pt-1">
                                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: id })}
                                            </p>
                                            {item.link && (
                                                <Link
                                                    href={item.link}
                                                    className="absolute inset-0"
                                                    onClick={() => {
                                                        setOpen(false);
                                                        handleMarkAsRead(item.id);
                                                    }}
                                                />
                                            )}
                                        </div>
                                        {!item.isRead && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 z-10"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleMarkAsRead(item.id);
                                                }}
                                            >
                                                <Check className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
