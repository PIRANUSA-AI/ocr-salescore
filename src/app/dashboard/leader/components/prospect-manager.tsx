'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, ChevronRight, Trash2, Eye, Sparkles, UserCheck, MessageSquare, RefreshCw, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { type ProspectData } from '@/types';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useDashboard } from '../context/dashboard-context';
import { AnalysisDetailDialog } from './analysis-detail-dialog';
import { FeedbackDetailDialog } from './feedback-detail-dialog';
import { AnalysisHistoryEntry } from '@/types';
import { Input } from '@/components/ui/input';
import { FadeIn } from '@/components/ui/fade-in';

export const ProspectManager = ({ embedded = false }: { embedded?: boolean }) => {
    const {
        analysisHistory,
        salesTeam,
        isLoading,
        isDeletingAnalysis,
        handleAssignProspects,
        handleDeleteAnalyses,
        handleGenerateTopics,
        isTopicLoading,
        refreshAllData,
    } = useDashboard();

    const { toast } = useToast();
    const [isAssigning, setIsAssigning] = useState<Record<string, boolean>>({});
    const [selectedProspects, setSelectedProspects] = useState<Record<string, ProspectData[]>>({});
    const [selectedSales, setSelectedSales] = useState<Record<string, string>>({});
    const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    const [detailDialogState, setDetailDialogState] = useState<{ isOpen: boolean, analysis: AnalysisHistoryEntry | null }>({ isOpen: false, analysis: null });
    const [feedbackDialogState, setFeedbackDialogState] = useState<{ isOpen: boolean, prospect: ProspectData | null }>({ isOpen: false, prospect: null });

    const filteredHistory = useMemo(() => {
        if (!analysisHistory) return [];
        return analysisHistory.filter(analysis =>
            analysis.webinarTitle.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [analysisHistory, searchTerm]);

    const handleSelectProspect = (analysisId: string, prospect: ProspectData, checked: boolean) => {
        const currentSelected = selectedProspects[analysisId] || [];
        if (checked) {
            setSelectedProspects({ ...selectedProspects, [analysisId]: [...currentSelected, prospect] });
        } else {
            setSelectedProspects({ ...selectedProspects, [analysisId]: currentSelected.filter(p => p.name !== prospect.name) });
        }
    };

    const handleSelectAllProspects = (analysis: AnalysisHistoryEntry, checked: boolean) => {
        if (checked) {
            setSelectedProspects({ ...selectedProspects, [analysis.id]: analysis.prospects });
        } else {
            const { [analysis.id]: _, ...rest } = selectedProspects;
            setSelectedProspects(rest);
        }
    };

    const handleAssign = async (analysisId: string) => {
        const salesId = selectedSales[analysisId];
        const prospectsToAssign = selectedProspects[analysisId] || [];

        if (!salesId) {
            toast({ title: "Pilih Sales", description: "Harap pilih sales terlebih dahulu.", variant: "destructive" });
            return;
        }
        if (prospectsToAssign.length === 0) {
            toast({ title: "Pilih Prospek", description: "Harap pilih minimal satu prospek untuk ditugaskan.", variant: "destructive" });
            return;
        }

        setIsAssigning({ ...isAssigning, [analysisId]: true });
        try {
            const selectedSalesUser = salesTeam.find(s => s.id === salesId);
            await handleAssignProspects(analysisId, prospectsToAssign, salesId, selectedSalesUser?.name || 'Sales');

            // Clear selections on success
            const { [analysisId]: __, ...restProspects } = selectedProspects;
            const { [analysisId]: ___, ...restSales } = selectedSales;
            setSelectedProspects(restProspects);
            setSelectedSales(restSales);

        } catch (error) {
            console.error(error);
        } finally {
            setIsAssigning({ ...isAssigning, [analysisId]: false });
        }
    };

    const handleSelectAnalysis = (analysisId: string, checked: boolean) => {
        if (checked) {
            setSelectedAnalyses(prev => [...prev, analysisId]);
        } else {
            setSelectedAnalyses(prev => prev.filter(id => id !== analysisId));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedAnalyses.length === 0) return;
        await handleDeleteAnalyses(selectedAnalyses);
        setSelectedAnalyses([]);
    };

    const handleGenerateTopicForAnalysis = async (analysis: AnalysisHistoryEntry) => {
        await handleGenerateTopics(analysis.id);
    };

    const handleOpenDetailDialog = (analysis: AnalysisHistoryEntry) => {
        setDetailDialogState({ isOpen: true, analysis });
    };

    const handleCloseDetailDialog = () => {
        setDetailDialogState({ isOpen: false, analysis: null });
    };

    const handleOpenFeedbackDialog = (prospect: ProspectData) => {
        setFeedbackDialogState({ isOpen: true, prospect });
    };

    const handleCloseFeedbackDialog = () => {
        setFeedbackDialogState({ isOpen: false, prospect: null });
    };

    if (isLoading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    const content = (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className={`flex flex-col gap-4 ${embedded ? 'pb-4 border-b' : ''}`}>
                <div className="flex justify-between items-center gap-4">
                    {!embedded && (
                        <div>
                            <CardTitle className="font-headline text-3xl font-bold w-fit">Riwayat Analisis & Prospek</CardTitle>
                            <CardDescription>Tinjau analisis, tugaskan peserta, dan lihat detail feedback.</CardDescription>
                        </div>
                    )}

                    <div className={`flex items-center gap-2 ${embedded ? 'w-full' : ''}`}>
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Cari webinar..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <Button variant="outline" size="icon" onClick={refreshAllData} disabled={isLoading}>
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                        {selectedAnalyses.length > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" disabled={isDeletingAnalysis}>
                                        {isDeletingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                        Hapus ({selectedAnalyses.length})
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Hapus Analisis Terpilih?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Tindakan ini tidak dapat dibatalkan. Data analisis dan prospek terkait akan dihapus permanen.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                            Hapus
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="space-y-4">
                {filteredHistory.length > 0 ? (
                    <Accordion type="single" collapsible className="w-full">
                        {filteredHistory.map((analysis) => {
                            const isSelected = selectedAnalyses.includes(analysis.id);

                            return (
                                <AccordionItem key={analysis.id} value={analysis.id}>
                                    <div className="flex items-center space-x-2 py-4">
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={(checked) => handleSelectAnalysis(analysis.id, !!checked)}
                                        />
                                        <AccordionTrigger className="flex-1 hover:no-underline py-0">
                                            <div className="flex flex-col items-start gap-1 text-left">
                                                <span className="font-semibold">{analysis.webinarTitle}</span>
                                                <div className="flex gap-2 text-xs text-muted-foreground">
                                                    <span>{format(new Date(analysis.webinarDate), 'dd MMMM yyyy', { locale: id })}</span>
                                                    <span>(Dibuat: {format(new Date(analysis.createdAt), 'dd MMM HH:mm', { locale: id })})</span>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                    </div>
                                    <AccordionContent>
                                        <div className="pl-6 space-y-4">
                                            <div className="flex gap-2 flex-wrap mb-4">
                                                <Button variant="secondary" size="sm" onClick={() => handleOpenDetailDialog(analysis)}>
                                                    <Eye className="mr-2 h-4 w-4" /> Detail Analisis
                                                </Button>
                                                {analysis.analysis.topicRecommendation && (
                                                    <Button variant="outline" size="sm" onClick={() => handleGenerateTopicForAnalysis(analysis)} disabled={isTopicLoading === analysis.id || analysis.topicsGenerated}>
                                                        {isTopicLoading === analysis.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-yellow-500" />}
                                                        {analysis.topicsGenerated ? 'Topik Digenerate' : 'Generate Topik Lanjut'}
                                                    </Button>
                                                )}
                                            </div>

                                            {analysis.prospects.length > 0 ? (
                                                <div className="border rounded-md">
                                                    <div className="bg-muted/50 p-2 flex items-center justify-between border-b">
                                                        <div className='flex items-center gap-2'>
                                                            <Checkbox
                                                                checked={selectedProspects[analysis.id]?.length === analysis.prospects.length}
                                                                onCheckedChange={(checked) => handleSelectAllProspects(analysis, !!checked)}
                                                            />
                                                            <span className="text-sm font-medium">Pilih Semua ({analysis.prospects.length})</span>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <Select
                                                                value={selectedSales[analysis.id] || ''}
                                                                onValueChange={(val) => setSelectedSales({ ...selectedSales, [analysis.id]: val })}
                                                            >
                                                                <SelectTrigger className="w-[180px] h-8">
                                                                    <SelectValue placeholder="Pilih Sales" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {salesTeam.map(sales => (
                                                                        <SelectItem key={sales.id} value={sales.id}>{sales.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleAssign(analysis.id)}
                                                                disabled={isAssigning[analysis.id] || !selectedSales[analysis.id] || !selectedProspects[analysis.id]?.length}
                                                            >
                                                                {isAssigning[analysis.id] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                                <Send className="mr-2 h-4 w-4" />
                                                                Tugaskan ({selectedProspects[analysis.id]?.length || 0})
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-[50px]"></TableHead>
                                                                <TableHead>Nama</TableHead>
                                                                <TableHead>Perusahaan</TableHead>
                                                                <TableHead className="w-[100px]">Aksi</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {analysis.prospects.map((prospect, idx) => {
                                                                const isSelected = selectedProspects[analysis.id]?.some(p => p.name === prospect.name);
                                                                const isAssigned = !!prospect.assignedSalesId;

                                                                // Safely handle dynamic properties
                                                                const displayName = prospect.name || 'Tanpa Nama';
                                                                const displayCompany = prospect.company || '-';

                                                                return (
                                                                    <TableRow key={idx}>
                                                                        <TableCell>
                                                                            <Checkbox
                                                                                checked={isSelected}
                                                                                onCheckedChange={(checked) => handleSelectProspect(analysis.id, prospect, !!checked)}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <div className="font-medium">{displayName}</div>
                                                                            {isAssigned && (
                                                                                <Badge variant="secondary" className="mt-1">
                                                                                    <UserCheck className="h-3 w-3 mr-1.5" />
                                                                                    Ditugaskan ke {prospect.assignedSalesName}
                                                                                </Badge>
                                                                            )}
                                                                        </TableCell>
                                                                        <TableCell className="text-sm text-muted-foreground">{displayCompany}</TableCell>
                                                                        <TableCell>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                onClick={() => handleOpenFeedbackDialog(prospect)}
                                                                            >
                                                                                <MessageSquare className='mr-2 h-4 w-4' />
                                                                                Lihat
                                                                            </Button>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                )
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            ) : (
                                                <div className="p-4 text-center text-sm text-muted-foreground border rounded-md">
                                                    Tidak ada peserta yang ditemukan untuk analisis ini.
                                                </div>
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            )
                        })}
                    </Accordion>
                ) : (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                        {searchTerm ? `Tidak ada riwayat analisis yang cocok dengan pencarian "${searchTerm}".` : 'Belum ada riwayat analisis. Jalankan analisis untuk memulai.'}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <>
            <AnalysisDetailDialog
                isOpen={detailDialogState.isOpen}
                onOpenChange={handleCloseDetailDialog}
                analysis={detailDialogState.analysis}
            />
            <FeedbackDetailDialog
                isOpen={feedbackDialogState.isOpen}
                onOpenChange={handleCloseFeedbackDialog}
                prospect={feedbackDialogState.prospect}
            />

            {embedded ? (
                content
            ) : (
                <FadeIn>
                    <Card>
                        <CardHeader>
                            <CardContent>
                                {content}
                            </CardContent>
                        </CardHeader>
                    </Card>
                </FadeIn>
            )}
        </>
    );
};
