
'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { getMediaAssets } from '@/app/actions/media';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MediaAsset } from '@/types';

interface MediaLibrarySelectorProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onAssetSelect: (asset: MediaAsset) => void;
}

export function MediaLibrarySelector({ isOpen, onOpenChange, onAssetSelect }: MediaLibrarySelectorProps) {
    const { toast } = useToast();
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchAssets = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedAssets = await getMediaAssets();
            setAssets(fetchedAssets);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Memuat Media', description: (error as Error).message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (isOpen) {
            fetchAssets();
        }
    }, [isOpen, fetchAssets]);

    const filteredAssets = assets.filter(asset =>
        asset.assetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl grid-rows-[auto_1fr_auto]">
                <DialogHeader>
                    <DialogTitle>Pilih Aset dari Media Library</DialogTitle>
                    <DialogDescription>Klik pada gambar untuk memilihnya sebagai banner email.</DialogDescription>
                    <div className="relative pt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Cari berdasarkan nama atau tag..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                </DialogHeader>

                <div className="py-4 pr-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                    {isLoading ? (
                        <div className="h-64 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : filteredAssets.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                            {filteredAssets.map(asset => (
                                <Card
                                    key={asset.id}
                                    className="group relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all border-0 shadow-md"
                                    onClick={() => onAssetSelect(asset)}
                                >
                                    <div className="aspect-square bg-muted relative">
                                        <Image src={asset.imageUrl} alt={asset.assetName} fill className="object-cover" />
                                    </div>
                                    <div className="p-3">
                                        <p className="font-semibold text-sm truncate">{asset.assetName}</p>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg">
                            <ImageIcon className="h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">Tidak Ada Aset Media</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{searchTerm ? `Tidak ada aset yang cocok.` : 'Unggah aset di halaman Media Library.'}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
