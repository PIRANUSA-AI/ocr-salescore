

'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createBulkCustomers } from '@/app/actions/leader';

interface ExcelPreviewDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    data: any[];
    onImportSuccess: () => void;
    creatorTeam?: 'AEC' | 'MFG';
}

export function ExcelPreviewDialog({ isOpen, onOpenChange, data, onImportSuccess, creatorTeam }: ExcelPreviewDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    
    const handleClose = () => {
        if (isLoading) return;
        onOpenChange(false);
    }

    const handleConfirmImport = async () => {
        if (!creatorTeam) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Tim pembuat tidak teridentifikasi. Tidak dapat melanjutkan impor.',
            });
            return;
        }
        
        setIsLoading(true);
        try {
            const result = await createBulkCustomers(data, creatorTeam);
            if (result.success) {
                toast({
                    title: 'Impor Berhasil',
                    description: `Dibuat: ${result.created}, Diperbarui: ${result.updated}, Dilewati: ${result.skipped}.`,
                });
                onImportSuccess();
                handleClose();
            } else {
                throw new Error(result.error || 'Terjadi kesalahan saat menyimpan data.');
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Gagal Mengimpor Data',
                description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    
    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl grid-rows-[auto_1fr_auto]">
                <DialogHeader>
                    <DialogTitle>Pratinjau Impor Excel</DialogTitle>
                    <DialogDescription>
                        Tinjau data di bawah ini sebelum mengimpor ke database. Ditemukan {data.length} baris untuk diimpor. Semua pelanggan baru akan ditandai sebagai bagian dari tim <span className="font-bold">{creatorTeam}</span>.
                    </DialogDescription>
                </DialogHeader>
                
                {/* This div wrapper with overflow-auto will provide both vertical and horizontal scrollbars */}
                <div className="overflow-auto border rounded-md" style={{ maxHeight: '60vh' }}>
                    <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                {headers.map(header => <TableHead key={header}>{header}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                    {headers.map(header => (
                                        <TableCell key={`${rowIndex}-${header}`} className="text-xs whitespace-nowrap">
                                            {String(row[header] ?? '')}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>Batal</Button>
                    <Button type="button" onClick={handleConfirmImport} disabled={isLoading || data.length === 0}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Konfirmasi & Impor
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
