'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, History, Eye, ArrowLeft, Mail, ExternalLink, Copy, Link as LinkIcon } from "lucide-react";
import { getEmailBlastHistory, saveEmailBlastHistory, type EmailBlastHistory as BaseEmailBlastHistory } from '@/app/actions/email-blast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { openEmailClient } from '@/lib/email-sender-utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EmailBlastHistory extends BaseEmailBlastHistory {
    clickCount?: number;
}

interface EmailBlastHistoryDialogProps {
    trigger?: React.ReactNode;
}

export function EmailBlastHistoryDialog({ trigger }: EmailBlastHistoryDialogProps) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [history, setHistory] = useState<EmailBlastHistory[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<EmailBlastHistory | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadHistory();
            setSelectedItem(null); // Reset detail view on open
        }
    }, [isOpen]);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const data = await getEmailBlastHistory();
            setHistory(data);
        } catch (error) {
            console.error("Failed to load history", error);
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async (client: 'gmail' | 'outlook') => {
        if (!selectedItem) return;

        // Ensure recipients exist, fallback to empty to avoid crash if legacy data
        const recipientList = selectedItem.recipients || [];

        const success = await openEmailClient(
            client,
            selectedItem.subject,
            selectedItem.content,
            recipientList,
            (msg) => toast({ title: 'Sukses', description: msg }),
            (err) => toast({ variant: 'destructive', title: 'Gagal', description: err })
        );

        if (success) {
            // Optional: Log this resend as a NEW history entry?
            // User said "terekam di history" (recorded in history) when clicking the button.
            // If I do this here, it will appear as a new entry at the top of the list next time.
            // Given the requirement "maka akan langsung terekam di history", YES, we should log it.
            saveEmailBlastHistory({
                subject: selectedItem.subject,
                content: selectedItem.content,
                recipientCount: selectedItem.recipientCount,
                recipients: recipientList,
                emailType: selectedItem.emailType,
                userEmail: 'user@current',
            }).then(() => loadHistory()).catch(err => console.error("Failed to save history:", err));
        }
    };

    // Render Detail View
    if (selectedItem) {
        return (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    {trigger || (
                        <Button variant="outline" size="sm">
                            <History className="mr-2 h-4 w-4" />
                            Riwayat
                        </Button>
                    )}
                </DialogTrigger>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedItem(null)}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <DialogTitle>Detail Email</DialogTitle>
                                <DialogDescription>
                                    Dikirim pada {selectedItem.sentAt ? format(new Date(selectedItem.sentAt), 'dd MMMM yyyy, HH:mm', { locale: id }) : '-'}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                        <div className="space-y-2 border p-4 rounded-md bg-muted/30">
                            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                                <span className="font-semibold text-muted-foreground">Subjek:</span>
                                <span className="font-medium">{selectedItem.subject}</span>

                                <span className="font-semibold text-muted-foreground">Penerima:</span>
                                <span>{selectedItem.recipientCount} Orang</span>

                                <span className="font-semibold text-muted-foreground">Tipe:</span>
                                <Badge variant="outline" className="w-fit">{selectedItem.emailType}</Badge>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold">Konten Email (Preview):</h3>
                            <div className="border rounded-md p-0 overflow-hidden h-[400px] relative bg-white">
                                <iframe
                                    srcDoc={selectedItem.content}
                                    className="w-full h-full border-0"
                                    sandbox="allow-same-origin"
                                    title="Email Preview"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Alert>
                                <Copy className="h-4 w-4" />
                                <AlertTitle>Gunakan Kembali / Kirim Ulang</AlertTitle>
                                <AlertDescription>
                                    Klik tombol di bawah untuk membuka klien email Anda. Konten akan disalin dan penerima akan diisi otomatis (TO/BCC).
                                    Aksi ini juga akan mencatat entri baru di riwayat.
                                </AlertDescription>
                            </Alert>
                            <div className="grid grid-cols-2 gap-4">
                                <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleResend('gmail')}>
                                    <Mail className="mr-2 h-5 w-5" /> Buka Gmail & Paste
                                </Button>
                                <Button size="lg" variant="outline" onClick={() => handleResend('outlook')}>
                                    <ExternalLink className="mr-2 h-5 w-5" /> Buka Email App Default
                                </Button>
                            </div>

                            {/* Tracking Link Copy Section */}
                            {(() => {
                                const trackingLinkMatch = selectedItem.content.match(/href="([^"]*\/api\/track[^"]*)"/);
                                const trackingLink = trackingLinkMatch ? trackingLinkMatch[1] : null; // Decode &amp; if needed, but browser usually handles it

                                if (trackingLink) {
                                    return (
                                        <div className="flex items-center gap-2 p-3 bg-slate-100 rounded-md border mt-2">
                                            <div className="p-2 bg-white rounded-full border shadow-sm">
                                                <LinkIcon className="h-4 w-4 text-blue-600" />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className="text-xs text-muted-foreground font-semibold">Tracking Link Terdeteksi</p>
                                                <p className="text-xs truncate w-full">{trackingLink}</p>
                                            </div>
                                            <Button size="sm" variant="secondary" onClick={() => {
                                                // Decode HTML entities like &amp; to &
                                                const decodedLink = trackingLink.replace(/&amp;/g, '&');
                                                navigator.clipboard.writeText(decodedLink);
                                                toast({ title: 'Tersalin!', description: 'Link tracking berhasil disalin ke clipboard.' });
                                            }}>
                                                <Copy className="h-3 w-3 mr-1" /> Copy
                                            </Button>
                                        </div>
                                    )
                                }
                                return null;
                            })()}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    // Render List View
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm">
                        <History className="mr-2 h-4 w-4" />
                        Riwayat
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
                    <div className="space-y-1">
                        <DialogTitle>Riwayat Email Blast</DialogTitle>
                        <DialogDescription>
                            Daftar email yang telah Anda buat dan kirim.
                        </DialogDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
                        <Loader2 className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </DialogHeader>

                <div className="flex-1 min-h-0 mt-4">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            Belum ada riwayat email.
                        </div>
                    ) : (
                        <ScrollArea className="h-[400px] border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Subjek</TableHead>
                                        <TableHead>Penerima</TableHead>
                                        <TableHead>Klik</TableHead>
                                        <TableHead>Tipe</TableHead>
                                        <TableHead className="text-right">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((item) => (
                                        <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedItem(item)}>
                                            <TableCell className="whitespace-nowrap">
                                                {item.sentAt ? format(new Date(item.sentAt), 'dd MMM yyyy, HH:mm', { locale: id }) : '-'}
                                            </TableCell>
                                            <TableCell className="font-medium">{item.subject}</TableCell>
                                            <TableCell>{item.recipientCount} Orang</TableCell>
                                            <TableCell>
                                                {item.clickCount !== undefined ? (
                                                    <Badge variant={item.clickCount > 0 ? "default" : "outline"} className={item.clickCount > 0 ? "bg-green-600 hover:bg-green-700" : ""}>
                                                        {item.clickCount} Klik
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">0 Klik</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="capitalize">{item.emailType}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button size="icon" variant="ghost" onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedItem(item);
                                                }}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
