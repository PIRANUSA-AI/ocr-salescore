'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Lightbulb, TrendingUp, CheckCircle, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { type WebinarAnalysisOutput, type TopicRecommendation, type AnalysisHistoryEntry } from "@/types";
import { useDashboard } from "./leader/context/dashboard-context";
import { Button } from "@/components/ui/button";

interface AnalysisResultCardProps {
    analysis: Omit<AnalysisHistoryEntry, 'prospects'>;
}

export function AnalysisResultCard({ analysis }: AnalysisResultCardProps) {
    const { handleGenerateTopics, isTopicLoading, handleGenerateInsights, isInsightsLoading } = useDashboard();

    const insights = analysis.analysis?.insights;
    const topicRecommendation = analysis.analysis?.topicRecommendation;

    // A simple function to parse the numeric rating from the string
    const parseRating = (ratingStr?: string): number => {
        if (!ratingStr) return 0;
        const match = ratingStr.match(/\((\d+\.?\d*)\/5\)/);
        return match ? parseFloat(match[1]) : 0;
    };

    const ratingValue = parseRating(insights?.rating);
    
    const getRatingColor = (rating: number) => {
        if (rating >= 4.5) return 'text-green-500';
        if (rating >= 3.5) return 'text-yellow-500';
        return 'text-red-500';
    };

    const formatList = (text: string = '') => {
        if (!text) return [];
        return text.split('*').map(s => s.trim()).filter(Boolean);
    }
    
    const isThisCardLoadingTopics = isTopicLoading === analysis.id;
    const isThisCardLoadingInsights = isInsightsLoading === analysis.id;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
            {/* Webinar Insights Card */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <div className="flex items-center gap-3">
                         <Star className="w-6 h-6 text-primary" />
                        <div>
                            <CardTitle>Ringkasan Webinar</CardTitle>
                            <CardDescription>Analisis sentimen & feedback peserta.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {analysis.insightsGenerated && insights ? (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-4xl font-bold ${getRatingColor(ratingValue)}`}>{ratingValue.toFixed(1)}</span>
                                <span className="text-muted-foreground">/ 5.0</span>
                                <Badge variant="outline">{insights.participantCount} Peserta</Badge>
                            </div>
                            <p className="text-sm italic text-muted-foreground">"{insights.ringkasan}"</p>
                            
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Poin Positif</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                    {formatList(insights.poin_positif).map((point, i) => <li key={`pos-${i}`}>{point}</li>)}
                                </ul>
                            </div>

                             <div className="space-y-2">
                                <h4 className="font-semibold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500" /> Area Peningkatan</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                    {formatList(insights.area_peningkatan).map((point, i) => <li key={`imp-${i}`}>{point}</li>)}
                                </ul>
                            </div>
                        </>
                    ) : (
                         <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg h-full">
                            <p className="text-muted-foreground">Ringkasan webinar belum dibuat untuk analisis ini.</p>
                            <Button 
                                className="mt-4"
                                onClick={() => handleGenerateInsights(analysis.id)}
                                disabled={isThisCardLoadingInsights}
                            >
                                {isThisCardLoadingInsights ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="mr-2 h-4 w-4" />
                                )}
                                {isThisCardLoadingInsights ? 'Membuat Ringkasan...' : 'Buat Ringkasan AI'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Topic Recommendation Card */}
            <Card className="lg:col-span-3">
                 <CardHeader>
                     <div className="flex items-center gap-3">
                         <Lightbulb className="w-6 h-6 text-primary" />
                        <div>
                            <CardTitle>Rekomendasi Topik Selanjutnya</CardTitle>
                            <CardDescription>Saran strategis berdasarkan polling & riset tren.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {analysis.topicsGenerated && topicRecommendation ? (
                        topicRecommendation.recommendations.map((rec, index) => (
                           <div key={index} className="p-4 bg-muted/50 rounded-lg">
                                <div className="text-sm text-muted-foreground">
                                    <span>Rekomendasi #{index + 1} (Sumber: </span>
                                    <Badge variant="outline">{rec.source}</Badge>
                                    <span>)</span>
                                </div>
                                <p className="font-semibold text-primary mt-1">{rec.topic}</p>
                                <p className="text-xs text-muted-foreground mt-1">{rec.rationale}</p>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-lg h-full">
                            <p className="text-muted-foreground">Rekomendasi topik belum dibuat untuk analisis ini.</p>
                            <Button 
                                className="mt-4"
                                onClick={() => handleGenerateTopics(analysis.id)}
                                disabled={isThisCardLoadingTopics}
                            >
                                {isThisCardLoadingTopics ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="mr-2 h-4 w-4" />
                                )}
                                {isThisCardLoadingTopics ? 'Membuat Rekomendasi...' : 'Buat Rekomendasi Topik'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
