'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import type { ProspectData } from '@/types';

interface FeedbackDetailDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    prospect: ProspectData | null;
}

export function FeedbackDetailDialog({ isOpen, onOpenChange, prospect }: FeedbackDetailDialogProps) {
    
    if (!prospect) {
        return null;
    }

    // Filter out internal/unnecessary fields from being displayed in the table
    const filteredData = Object.entries(prospect).filter(([key]) => 
        !['hook_chat', 'assignedSalesId', 'assignedSalesName', 'name', 'company'].includes(key) &&
        !key.toLowerCase().includes('timestamp')
    );

    // Function to format keys from camelCase to Title Case
    const formatKey = (key: string) => {
        const result = key.replace(/([A-Z])/g, ' $1');
        return result.charAt(0).toUpperCase() + result.slice(1);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl grid-rows-[auto_1fr_auto]">
                <DialogHeader>
                    <DialogTitle>Detail Peserta</DialogTitle>
                    <DialogDescription>
                        Menampilkan semua data yang terekam untuk peserta: <span className="font-semibold text-foreground">{prospect.name}</span> dari <span className="font-semibold text-foreground">{prospect.company}</span>.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>
                    <div className="border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableCell className="font-medium w-1/3">Pertanyaan / Data</TableCell>
                                    <TableCell className="font-medium">Jawaban / Isi</TableCell>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.map(([key, value]) => (
                                    <TableRow key={key}>
                                        <TableCell className="text-muted-foreground align-top">{formatKey(key)}</TableCell>
                                        <TableCell className="whitespace-pre-wrap">{String(value || '-')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
