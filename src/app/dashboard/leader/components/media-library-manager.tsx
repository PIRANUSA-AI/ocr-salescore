
'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getMediaAssets, createMediaAsset, deleteMediaAsset } from '@/app/actions/media';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, UploadCloud, Search, Trash2, Tag, Image as ImageIcon, Download } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { MediaAsset } from '@/types';
import { app } from '@/lib/firebase'; // Import the client-side firebase app

const storage = getStorage(app);

export function MediaLibraryManager() {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // State for the upload form
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [assetName, setAssetName] = useState('');
    const [tags, setTags] = useState('');

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
        fetchAssets();
    }, [fetchAssets]);

    const handleFileUpload = async () => {
        if (!fileToUpload || !assetName.trim() || !userProfile) {
            toast({ variant: 'destructive', title: 'Data Tidak Lengkap', description: 'Pastikan file dan nama aset sudah diisi.' });
            return;
        }

        setIsUploading(true);
        const fileName = `${Date.now()}-${fileToUpload.name}`;
        const storageRef = ref(storage, `images/${fileName}`);

        try {
            // 1. Upload file to Firebase Storage
            const snapshot = await uploadBytes(storageRef, fileToUpload);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // 2. Create metadata in Firestore via Server Action
            const newAssetId = snapshot.ref.name.split('.')[0];
            const tagsArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);

            const result = await createMediaAsset({
                id: newAssetId,
                assetName,
                fileName,
                imageUrl: downloadURL,
                tags: tagsArray,
                uploadedBy: {
                    uid: userProfile.uid,
                    name: userProfile.name,
                }
            });

            if (!result.success) {
                // If Firestore metadata fails, try to delete the uploaded image
                await deleteObject(storageRef);
                throw new Error(result.error || 'Gagal menyimpan metadata.');
            }

            toast({ title: 'Sukses', description: 'Aset media berhasil diunggah.' });

            // Reset form and refresh list
            setFileToUpload(null);
            setAssetName('');
            setTags('');
            fetchAssets();

        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Mengunggah', description: (error as Error).message });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (asset: MediaAsset) => {
        try {
            await deleteMediaAsset(asset.id, asset.fileName);
            toast({ title: 'Sukses', description: `"${asset.assetName}" berhasil dihapus.` });
            setAssets(prev => prev.filter(a => a.id !== asset.id));
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Menghapus', description: (error as Error).message });
        }
    };

    const [selectedTag, setSelectedTag] = useState<string>('all');

    // Extract unique tags for filter
    const uniqueTags = Array.from(new Set(assets.flatMap(asset => asset.tags))).sort();

    const filteredAssets = assets.filter(asset => {
        const matchesSearch = asset.assetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            asset.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesTag = selectedTag === 'all' || asset.tags.includes(selectedTag);

        return matchesSearch && matchesTag;
    });

    const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);

    const handleDownload = async (e: React.MouseEvent, asset: MediaAsset) => {
        e.stopPropagation(); // Prevent opening the dialog
        try {
            const response = await fetch(asset.imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = asset.fileName || 'downloaded-image'; // Fallback name
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast({ title: 'Download Berhasil', description: 'Gambar berhasil diunduh.' });
        } catch (error) {
            console.error('Download error:', error);
            toast({ variant: 'destructive', title: 'Gagal Mengunduh', description: 'Terjadi kesalahan saat mengunduh gambar.' });
        }
    };

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Unggah Aset Media Baru</CardTitle>
                    <CardDescription>Unggah gambar banner, poster, atau aset lainnya untuk digunakan dalam kampanye email Anda.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 space-y-2">
                        <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">Pilih File Gambar</label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                {fileToUpload ? (
                                    <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                                ) : (
                                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                                )}
                                <div className="flex text-sm text-muted-foreground">
                                    <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-background font-medium text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary hover:text-primary-dark">
                                        <span>{fileToUpload ? fileToUpload.name : 'Pilih file untuk diunggah'}</span>
                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={e => setFileToUpload(e.target.files?.[0] || null)} />
                                    </label>
                                </div>
                                <p className="text-xs text-muted-foreground">PNG, JPG, GIF hingga 10MB</p>
                            </div>
                        </div>
                    </div>
                    <div className="md:col-span-2 space-y-4">
                        <div>
                            <label htmlFor="asset-name" className="block text-sm font-medium text-gray-700">Nama Aset</label>
                            <Input id="asset-name" value={assetName} onChange={e => setAssetName(e.target.value)} placeholder="Contoh: Banner Promo Q3" disabled={isUploading} />
                        </div>
                        <div>
                            <label htmlFor="tags" className="block text-sm font-medium text-gray-700">Tags (pisahkan dengan koma)</label>
                            <Input id="tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="Contoh: promo, zwcad, banner" disabled={isUploading} />
                        </div>
                        <Button onClick={handleFileUpload} disabled={isUploading || !fileToUpload || !assetName}>
                            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            {isUploading ? 'Mengunggah...' : 'Simpan Aset Media'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Perpustakaan Media</CardTitle>
                    <CardDescription>Cari dan kelola semua aset media yang telah Anda unggah.</CardDescription>
                    <div className="flex flex-col md:flex-row gap-4 pt-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Cari berdasarkan nama..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="w-full md:w-[200px]">
                            <select
                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={selectedTag}
                                onChange={(e) => setSelectedTag(e.target.value)}
                            >
                                <option value="all">Semua Tag</option>
                                {uniqueTags.map(tag => (
                                    <option key={tag} value={tag}>{tag}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="h-64 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : filteredAssets.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {filteredAssets.map(asset => (
                                <Card
                                    key={asset.id}
                                    className="group relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all duration-200 border-0 shadow-sm"
                                    onClick={() => setSelectedAsset(asset)}
                                >
                                    <div className="aspect-square bg-muted relative rounded-lg overflow-hidden">
                                        <Image src={asset.imageUrl} alt={asset.assetName} layout="fill" objectFit="cover" className="group-hover:scale-105 transition-transform duration-500" />

                                        {/* Overlay with Content (Name, Tags, Download) */}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                            <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                                <p className="font-semibold text-white text-sm truncate mb-1">{asset.assetName}</p>
                                                <div className="flex flex-wrap gap-1 mb-3">
                                                    {asset.tags.slice(0, 2).map(tag => (
                                                        <span key={tag} className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-full h-8 text-xs bg-white text-black hover:bg-white/90"
                                                    onClick={(e) => handleDownload(e, asset)}
                                                >
                                                    <Download className="mr-2 h-3 w-3" />
                                                    Download
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-lg">
                            <ImageIcon className="h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">Tidak Ada Aset Media</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{searchTerm ? `Tidak ada aset yang cocok.` : 'Unggah aset pertama Anda untuk memulai.'}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{selectedAsset?.assetName}</DialogTitle>
                    </DialogHeader>
                    {selectedAsset && (
                        <div className="space-y-4">
                            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                                <Image
                                    src={selectedAsset.imageUrl}
                                    alt={selectedAsset.assetName}
                                    fill
                                    className="object-contain"
                                />
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-medium leading-none">Tags</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedAsset.tags.map(tag => (
                                        <Badge key={tag} variant="outline">{tag}</Badge>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t">
                                <div className="text-xs text-muted-foreground">
                                    Uploaded on {new Date(selectedAsset.createdAt).toLocaleDateString()}
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" size="sm">
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Hapus Aset
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Hapus aset ini?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Tindakan ini permanen. File "{selectedAsset.assetName}" akan dihapus dari sistem.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Batal</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => {
                                                handleDelete(selectedAsset);
                                                setSelectedAsset(null);
                                            }}>
                                                Ya, Hapus
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
