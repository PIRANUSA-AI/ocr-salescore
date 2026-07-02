'use client';

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Building2,
    Globe,
    MapPin,
    Users,
    Cpu,
    Briefcase,
    AlertTriangle,
    Sparkles,
    RefreshCw,
    ExternalLink
} from "lucide-react";
import { useState, useEffect } from "react";
import { CompanyProfile } from "@/types";
import { fetchCompanyProfile, performCompanyAnalysis, getDeepScanUsage } from "@/app/actions/company";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CompanyDetailSheetProps {
    companyName: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CompanyDetailSheet({ companyName, open, onOpenChange }: CompanyDetailSheetProps) {
    const [profile, setProfile] = useState<CompanyProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasCheckedCache, setHasCheckedCache] = useState(false);
    const [activeTab, setActiveTab] = useState("overview");
    const [quotaInfo, setQuotaInfo] = useState<{ usage: number, limit: number, remaining: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && companyName) {
            setHasCheckedCache(false);
            setProfile(null);
            setError(null);
            checkExistingProfile(companyName);
            // Fetch Quota
            getDeepScanUsage().then(info => setQuotaInfo(info));
        } else {
            setProfile(null);
            setError(null);
        }
    }, [open, companyName]);

    const checkExistingProfile = async (name: string) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchCompanyProfile(name);
            setProfile(data);
        } catch (error) {
            console.error("Failed to fetch company profile:", error);
        } finally {
            setLoading(false);
            setHasCheckedCache(true);
        }
    };

    const handleAnalyze = async () => {
        if (!companyName) return;
        setLoading(true);
        setError(null);
        try {
            const data = await performCompanyAnalysis(companyName);
            // Check if data is mostly empty (failed search)
            if (data && data.industry === 'Unknown') {
                setError("Pencarian gagal. Data tidak ditemukan dari LinkedIn/Google.");
                setProfile(data); // Still show what we have
            } else {
                setProfile(data);
            }
        } catch (err: any) {
            console.error("Failed to analyze company:", err);
            setError(err.message || "Gagal menganalisis perusahaan. Silakan coba lagi.");
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = () => {
        setError(null);
        handleAnalyze();
    };

    const isQuotaExhausted = quotaInfo && quotaInfo.remaining <= 0;
    const isQuotaLow = quotaInfo && quotaInfo.remaining > 0 && quotaInfo.remaining <= 15;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col h-full bg-background border-l">
                {/* Header Section */}
                <div className="p-6 border-b bg-muted/20">
                    <SheetHeader>
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <SheetTitle className="text-2xl font-bold flex items-center gap-2">
                                    <Building2 className="h-6 w-6 text-primary" />
                                    {companyName}
                                </SheetTitle>
                                <div className="flex items-center gap-2">
                                    <SheetDescription>Detail Intelijen Perusahaan</SheetDescription>
                                    {quotaInfo && (
                                        <Badge variant="outline" className={cn(
                                            "ml-2 text-xs font-normal border-slate-200",
                                            quotaInfo.usage >= quotaInfo.limit ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-500"
                                        )}>
                                            Scan Limit: {quotaInfo.usage}/{quotaInfo.limit}
                                        </Badge>
                                    )}
                                </div>
                                {loading ? (
                                    <Skeleton className="h-5 w-32" />
                                ) : profile ? (
                                    <div className="flex items-center gap-2">
                                        <Badge variant={
                                            profile.potentialTier === 'Enterprise' ? 'default' :
                                                profile.potentialTier === 'SMB' ? 'secondary' : 'outline'
                                        }>
                                            {profile.potentialTier}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {profile.industry || 'Industri tidak diketahui'}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground">
                                        Belum ada data intelijen.
                                    </div>
                                )}
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-8">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                                <Sparkles className="h-12 w-12 text-primary animate-pulse relative z-10" />
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="font-semibold text-lg">
                                    {profile ? "Memperbarui Data..." : "Menganalisa Perusahaan..."}
                                </h3>
                                <p className="text-sm text-muted-foreground w-64 mx-auto">
                                    AI sedang mencari data tech stack, project, dan reputasi {companyName}.
                                </p>
                            </div>
                            {/* Loading Skeleton */}
                            <div className="w-full space-y-3 pt-4 max-w-sm">
                                <Skeleton className="h-4 w-3/4 mx-auto" />
                                <Skeleton className="h-4 w-1/2 mx-auto" />
                                <Skeleton className="h-4 w-5/6 mx-auto" />
                            </div>
                        </div>
                    ) : profile ? (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                            <div className="px-6 pt-4">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="overview">Overview</TabsTrigger>
                                    <TabsTrigger value="tech">Tech & Project</TabsTrigger>
                                    <TabsTrigger value="risk">Risk & Stats</TabsTrigger>
                                </TabsList>
                            </div>

                            <ScrollArea className="flex-1">
                                <div className="p-6 space-y-6">
                                    <TabsContent value="overview" className="mt-0 space-y-6">
                                        {/* Quick Summary */}
                                        <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                                            <h4 className="text-sm font-semibold flex items-center gap-2 text-primary mb-2">
                                                <Sparkles className="h-4 w-4" />
                                                AI Summary
                                            </h4>
                                            <p className="text-sm text-muted-foreground leading-relaxed">
                                                {profile.summary}
                                            </p>
                                        </div>

                                        {/* Contact Info */}
                                        <div className="grid gap-4">
                                            <div className="flex items-center gap-3 text-sm">
                                                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                                                {profile.website ? (
                                                    <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                                                        target="_blank" rel="noopener noreferrer"
                                                        className="hover:underline text-blue-600 flex items-center gap-1">
                                                        {profile.website}
                                                        <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                ) : <span className="text-muted-foreground">Website tidak tersedia</span>}
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span>{profile.employeeCount || 'Unknown'} Karyawan</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span>{profile.address || 'Alamat tidak diketahui'}</span>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="tech" className="mt-0 space-y-6">
                                        {/* Tech Stack */}
                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <Cpu className="h-4 w-4 text-blue-500" />
                                                    Tech Stack
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="flex flex-wrap gap-2">
                                                    {profile.techStack.length > 0 ? profile.techStack.map((tech, i) => (
                                                        <Badge key={i} variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">
                                                            {tech}
                                                        </Badge>
                                                    )) : (
                                                        <p className="text-sm text-muted-foreground italic">Tidak ada data software spesifik ditemukan.</p>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {/* Projects */}
                                        <Card>
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <Briefcase className="h-4 w-4 text-orange-500" />
                                                    Key Projects
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <ul className="space-y-2">
                                                    {profile.keyProjects.length > 0 ? profile.keyProjects.map((project, i) => (
                                                        <li key={i} className="text-sm flex items-start gap-2">
                                                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                                                            <span className="text-muted-foreground">{project}</span>
                                                        </li>
                                                    )) : (
                                                        <p className="text-sm text-muted-foreground italic">Tidak ada data proyek spesifik ditemukan.</p>
                                                    )}
                                                </ul>
                                            </CardContent>
                                        </Card>
                                    </TabsContent>

                                    <TabsContent value="risk" className="mt-0 space-y-6">
                                        {/* Risk Assessment */}
                                        <div className={cn(
                                            "p-4 rounded-lg border",
                                            profile.riskAssessment?.toLowerCase().includes("high") ? "bg-red-50 border-red-200" :
                                                profile.riskAssessment?.toLowerCase().includes("medium") ? "bg-yellow-50 border-yellow-200" :
                                                    "bg-green-50 border-green-200"
                                        )}>
                                            <h4 className="text-base font-semibold flex items-center gap-2 mb-2">
                                                <AlertTriangle className={cn("h-5 w-5",
                                                    profile.riskAssessment?.toLowerCase().includes("high") ? "text-red-600" :
                                                        profile.riskAssessment?.toLowerCase().includes("medium") ? "text-yellow-600" :
                                                            "text-green-600"
                                                )} />
                                                Risk Assessment
                                            </h4>
                                            <p className="text-sm text-muted-foreground">
                                                {profile.riskAssessment || "Tidak ada indikasi risiko ditemukan."}
                                            </p>
                                        </div>

                                        <div className="text-xs text-muted-foreground text-center pt-8">
                                            Analisis terakhir: {new Date(profile.lastAnalysisDate).toLocaleDateString()}
                                            <br />
                                            Data didapat dari estimasi AI & sumber publik.
                                        </div>
                                    </TabsContent>
                                </div>
                            </ScrollArea>
                        </Tabs>
                    ) : hasCheckedCache ? (
                        /* Empty State with Action */
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                            <div className="bg-primary/5 p-6 rounded-full">
                                <Building2 className="h-12 w-12 text-primary" />
                            </div>
                            <div className="space-y-2 max-w-xs mx-auto">
                                <h3 className="font-semibold text-xl">Analisa {companyName}</h3>
                                <p className="text-sm text-muted-foreground">
                                    Jalankan AI Intelligence Agent untuk mencari data Tech Stack, Proyek, dan Risiko perusahaan ini secara otomatis.
                                </p>
                            </div>

                            {/* Error Display */}
                            {error && (
                                <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-4 max-w-sm w-full">
                                    <p className="text-sm font-medium mb-2">⚠️ {error}</p>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={handleRetry} className="flex-1">
                                            <RefreshCw className="h-3 w-3 mr-1" />
                                            Coba Lagi
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Quota Warning */}
                            {isQuotaExhausted && (
                                <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 max-w-sm w-full text-sm">
                                    🚫 Quota habis ({quotaInfo?.usage}/{quotaInfo?.limit}). Reset awal bulan depan.
                                </div>
                            )}
                            {isQuotaLow && (
                                <div className="bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg p-3 max-w-sm w-full text-sm">
                                    ⚠️ Sisa quota tinggal {quotaInfo?.remaining}. Hemat penggunaan!
                                </div>
                            )}

                            {/* Main Action Button */}
                            <Button
                                size="lg"
                                onClick={handleAnalyze}
                                className="gap-2 w-full max-w-sm"
                                disabled={isQuotaExhausted || loading}
                            >
                                <Sparkles className="h-4 w-4" />
                                {isQuotaExhausted ? "Quota Habis" : "Mulai Analisa (Deep Dive)"}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <Skeleton className="h-10 w-10 rounded-full" />
                        </div>
                    )}
                </div>

                {/* Footer Action (Only show Refresh if profile exists) */}
                {profile && !loading && (
                    <div className="p-4 border-t bg-background">
                        <Button
                            className="w-full gap-2"
                            variant="outline"
                            onClick={handleAnalyze}
                        >
                            <RefreshCw className="h-4 w-4" />
                            Refresh Intelligence
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
