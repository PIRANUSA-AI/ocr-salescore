'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, Sparkles, FileUp, XCircle, Eye } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useDashboard } from '@/app/dashboard/dashboard-context';
import { FadeIn } from '@/components/ui/fade-in';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

export const AnalysisManager = ({ embedded = false }: { embedded?: boolean }) => {
    const {
        handleStartAnalysis,
        isAnalysisLoading,
    } = useDashboard();

    const [webinarTitle, setWebinarTitle] = useState('');
    const [webinarDate, setWebinarDate] = useState<Date | undefined>();
    const [feedbackFile, setFeedbackFile] = useState<File | null>(null);
    const [feedbackData, setFeedbackData] = useState<string>('');

    // Preview State
    const [showPreview, setShowPreview] = useState(false);
    const [previewRows, setPreviewRows] = useState<string[][]>([]);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

    const { toast } = useToast();
    const { user } = useAuth();

    const isButtonDisabled = !webinarTitle || !webinarDate || !feedbackFile || isAnalysisLoading;

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.type !== "text/csv") {
                toast({
                    variant: 'destructive',
                    title: 'File Tidak Valid',
                    description: 'Harap unggah file dengan format .csv'
                });
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                setFeedbackFile(file);
                setFeedbackData(text);

                // Parse for preview
                try {
                    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                    if (lines.length > 0) {
                        const headers = lines[0].split(',').map(h => h.trim());
                        const rows = lines.slice(1, 6).map(line => line.split(',').map(c => c.trim())); // Preview up to 5 rows
                        setCsvHeaders(headers);
                        setPreviewRows(rows);
                        setShowPreview(true); // Auto-show preview
                    }
                } catch (err) {
                    console.error("Error parsing CSV preview", err);
                }
            };
            reader.readAsText(file);
        }
    };

    const handleRemoveFile = () => {
        setFeedbackFile(null);
        setFeedbackData('');
        setPreviewRows([]);
        setCsvHeaders([]);
        const fileInput = document.getElementById('feedback-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    }

    const handlePreviewClick = () => {
        if (!feedbackFile || previewRows.length === 0) {
            toast({ variant: 'destructive', title: 'Error', description: 'Silakan unggah file CSV yang valid terlebih dahulu.' });
            return;
        }
        setShowPreview(true);
    };

    const handleAnalyze = async () => {
        if (!user || !feedbackData || !webinarDate || !webinarTitle) {
            toast({ variant: 'destructive', title: 'Error', description: 'Pastikan semua data terisi dan file CSV sudah diunggah.' });
            return;
        }

        setShowPreview(false); // Close dialog

        await handleStartAnalysis({
            webinarTitle,
            webinarDate,
            feedbackData,
            userId: user.uid,
        });

        // Reset form after analysis starts
        setWebinarTitle('');
        setWebinarDate(undefined);
        handleRemoveFile();
    }

    const content = (
        <div className={embedded ? "space-y-6" : "space-y-8"}>
            {!embedded && (
                <CardHeader>
                    <CardTitle className="font-headline text-3xl font-bold w-fit">Analisis Feedback Webinar</CardTitle>
                    <CardDescription>Unggah data feedback dari peserta untuk dianalisis oleh AI. Hasilnya berupa daftar prospek berkualitas yang dapat Anda temukan di tab "Riwayat Analisis & Prospek".</CardDescription>
                </CardHeader>
            )}
            <div className={embedded ? "" : "p-6 pt-0"}>
                {/* Reuse existing content structure but handle CardContent replacement manually if needed or just use div */}
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">1. Masukkan Judul Webinar</label>
                            <Input
                                placeholder="Contoh: ZWCAD untuk Desain Arsitektur"
                                value={webinarTitle}
                                onChange={(e) => setWebinarTitle(e.target.value)}
                                disabled={isAnalysisLoading}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">2. Pilih Tanggal Webinar</label>
                            <DatePicker date={webinarDate} setDate={setWebinarDate} disabled={isAnalysisLoading} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">3. Unggah File CSV Feedback</label>
                        {!feedbackFile ? (
                            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                                <input
                                    type="file"
                                    id="feedback-upload"
                                    accept=".csv"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={handleFileChange}
                                    disabled={isAnalysisLoading}
                                />
                                <div className="flex flex-col items-center gap-2">
                                    <FileUp className="h-8 w-8 text-muted-foreground" />
                                    <p className="text-sm font-medium">Klik atau drop file CSV di sini</p>
                                    <p className="text-xs text-muted-foreground">Format: Nama, Email, Perusahaan, Jabatan, Jawaban Kuesioner...</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                                <div className="flex items-center gap-3">
                                    <FileUp className="h-5 w-5 text-primary" />
                                    <div>
                                        <p className="text-sm font-medium">{feedbackFile.name}</p>
                                        <p className="text-xs text-muted-foreground">{(feedbackFile.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handlePreviewClick}>
                                        <Eye className="mr-2 h-4 w-4" /> Preview
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isAnalysisLoading}>
                                        <XCircle className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <Button
                        onClick={handlePreviewClick} // Change to preview flow first
                        className="w-full md:w-auto min-w-[200px]"
                        disabled={isButtonDisabled}
                    >
                        {isAnalysisLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Menganalisis...
                            </>
                        ) : (
                            <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Mulai Analisis AI
                            </>
                        )}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center md:text-left">
                        * Hasil analisis akan muncul di tab <span className="font-semibold">"Riwayat & Prospek"</span>.
                    </p>
                </div>
            </div>

            {/* PREVIEW DIALOG */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Preview Data CSV</DialogTitle>
                        <DialogDescription>
                            Pastikan data terbaca dengan benar. Menampilkan 5 baris pertama dari file <b>{feedbackFile?.name}</b>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="border rounded-md overflow-x-auto max-h-[300px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {csvHeaders.map((header, i) => (
                                        <TableHead key={i} className="whitespace-nowrap">{header}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewRows.map((row, i) => (
                                    <TableRow key={i}>
                                        {row.map((cell, j) => (
                                            <TableCell key={j} className="whitespace-nowrap">{cell}</TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPreview(false)}>Batal</Button>
                        <Button onClick={handleAnalyze}>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Ya, Lanjutkan Analisis
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );

    if (embedded) {
        return content;
    }

    return (
        <FadeIn>
            <Card>
                {content}
            </Card>
        </FadeIn>
    );
};
