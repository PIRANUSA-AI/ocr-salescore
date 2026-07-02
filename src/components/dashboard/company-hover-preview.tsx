'use client';

import React, { useState, useEffect } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Building2, ExternalLink, Loader2 } from 'lucide-react';
import { fetchCompanyProfile } from '@/app/actions/company';
import type { CompanyProfile } from '@/types';

interface CompanyHoverPreviewProps {
    companyName: string;
    children: React.ReactNode;
    onAnalyzeClick?: () => void;
}

export function CompanyHoverPreview({ companyName, children, onAnalyzeClick }: CompanyHoverPreviewProps) {
    const [profile, setProfile] = useState<CompanyProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasChecked, setHasChecked] = useState(false);

    const handleOpenChange = (open: boolean) => {
        if (open && !hasChecked) {
            setLoading(true);
            fetchCompanyProfile(companyName)
                .then(data => setProfile(data))
                .catch(console.error)
                .finally(() => {
                    setLoading(false);
                    setHasChecked(true);
                });
        }
    };

    return (
        <HoverCard openDelay={300} closeDelay={100} onOpenChange={handleOpenChange}>
            <HoverCardTrigger asChild>
                {children}
            </HoverCardTrigger>
            <HoverCardContent className="w-80" side="right" align="start">
                {loading ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : profile ? (
                    <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg">
                                <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm truncate">{profile.name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant={
                                        profile.potentialTier === 'Enterprise' ? 'default' :
                                            profile.potentialTier === 'SMB' ? 'secondary' : 'outline'
                                    } className="text-[10px]">
                                        {profile.potentialTier}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground truncate">
                                        {profile.industry || 'Unknown'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Summary */}
                        {profile.summary && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                                {profile.summary}
                            </p>
                        )}

                        {/* Quick Stats */}
                        <div className="flex gap-2 text-[10px] text-muted-foreground">
                            {profile.techStack && profile.techStack.length > 0 && (
                                <span>🔧 {profile.techStack.slice(0, 2).join(', ')}{profile.techStack.length > 2 ? '...' : ''}</span>
                            )}
                        </div>

                        {/* Actions */}
                        {onAnalyzeClick && (
                            <Button size="sm" variant="outline" className="w-full text-xs" onClick={(e) => {
                                e.stopPropagation();
                                onAnalyzeClick();
                            }}>
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Lihat Detail
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-4 space-y-3">
                        <div className="bg-muted p-3 rounded-full w-fit mx-auto">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Belum ada data intelijen untuk perusahaan ini.
                        </div>
                        {onAnalyzeClick && (
                            <Button size="sm" className="text-xs gap-1" onClick={(e) => {
                                e.stopPropagation();
                                onAnalyzeClick();
                            }}>
                                <Sparkles className="h-3 w-3" />
                                Analisa Sekarang
                            </Button>
                        )}
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
}
