'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AnalysisResultCard } from '../../analysis-result-card';
import type { AnalysisHistoryEntry } from '@/types';

interface AnalysisDetailDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    analysis: AnalysisHistoryEntry | null;
}

export function AnalysisDetailDialog({ isOpen, onOpenChange, analysis }: AnalysisDetailDialogProps) {
    
    if (!analysis) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl grid-rows-[auto_1fr_auto]">
                <DialogHeader>
                    <DialogTitle>Detail Hasil Analisis</DialogTitle>
                    <DialogDescription>
                        Menampilkan rincian lengkap untuk webinar: "{analysis.webinarTitle}".
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 pr-3 overflow-y-auto" style={{maxHeight: '80vh'}}>
                    <AnalysisResultCard 
                        analysis={analysis}
                    />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
