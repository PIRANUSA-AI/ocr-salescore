
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mail, FileUp, XCircle, ExternalLink, Copy, Bot, Upload, Type, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateEmailBlast, type EmailGenerationInput } from '@/ai/flows/generate-email-blast-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { PRODUCT_LIST, type MediaAsset } from '@/types';
import { MediaLibrarySelector } from './media-library-selector';


interface EmailBlastDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  recipientEmails: string[];
  recipientCount: number;
}

const emailTypeOptions = [
    { value: 'thanksLetter', label: 'Ucapan Terima Kasih (Pasca-Acara)' },
    { value: 'promotion', label: 'Promosi Produk' },
    { value: 'invitation', label: 'Undangan Acara (Webinar/Offline)' },
    { value: 'news', label: 'Berita / Update' },
];

const emailGeneratorSchema = z.object({
  emailType: z.enum(['thanksLetter', 'promotion', 'invitation', 'news']),
  
  // Dynamic fields
  eventName: z.string().optional(),
  eventDate: z.date().optional(),
  eventKeyPoints: z.string().optional(),
  offerDemo: z.boolean().optional(),
  
  promoProduct: z.string().optional(),
  promoDetails: z.string().optional(),
  promoTargetAudience: z.string().optional(),
  promoCTA: z.string().optional(),
  
  invitationType: z.enum(['Online', 'Offline']).optional(),
  invitationTitle: z.string().optional(),
  invitationDateTime: z.string().optional(),
  invitationSpeakers: z.string().optional(),
  invitationBenefits: z.string().optional(),
  invitationLocationName: z.string().optional(),
  invitationMapLink: z.string().optional(),
  invitationRegistrationLink: z.string().optional(),

  newsContent: z.string().optional(),

  // Layout fields
  bannerPosition: z.enum(['none', 'top', 'middle', 'bottom']).default('none'),

}).refine(data => {
    if (data.emailType === 'thanksLetter') return !!data.eventName && !!data.eventDate;
    if (data.emailType === 'promotion') return !!data.promoProduct && !!data.promoDetails;
    if (data.emailType === 'invitation') return !!data.invitationTitle && !!data.invitationBenefits;
    if (data.emailType === 'news') return !!data.newsContent;
    return true;
}, {
    message: "Harap isi semua field yang relevan untuk tipe email yang dipilih.",
    path: ["emailType"],
});

type EmailGeneratorFormData = z.infer<typeof emailGeneratorSchema>;

export function EmailBlastDialog({ isOpen, onOpenChange, recipientEmails, recipientCount }: EmailBlastDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('generate-ai');
  const [subject, setSubject] = useState('');
  const [bodyContent, setBodyContent] = useState(''); // Can be HTML or plain text
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // New state for media library integration
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const form = useForm<EmailGeneratorFormData>({
    resolver: zodResolver(emailGeneratorSchema),
    defaultValues: { emailType: 'thanksLetter', offerDemo: false, invitationType: 'Online', bannerPosition: 'none' },
  });
  const watchedEmailType = form.watch('emailType');
  const watchedInvitationType = form.watch('invitationType');

  const resetDialog = () => {
    setActiveTab('generate-ai');
    setSubject('');
    setBodyContent('');
    setFileName('');
    setIsLoading(false);
    setSelectedAsset(null);
    form.reset();
  };

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(resetDialog, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('html')) {
        toast({ variant: 'destructive', title: 'File Tidak Valid', description: 'Harap unggah file .html' });
        return;
    }

    const reader = new FileReader();
    reader.onloadstart = () => setIsLoading(true);
    reader.onerror = () => {
      toast({ variant: 'destructive', title: 'Gagal membaca file.' });
      setIsLoading(false);
    };
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setBodyContent(result);
      setFileName(file.name);
      setIsLoading(false);
    };
    reader.readAsText(file); // Reading as text for HTML
  };
  
  const handleGenerateAI = async (data: EmailGeneratorFormData) => {
    setIsLoading(true);
    setSubject('');
    setBodyContent('');

    const payload: EmailGenerationInput = {
      ...data,
      eventDate: data.eventDate?.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
      bannerImageUrl: selectedAsset?.imageUrl, // Pass the image URL
      bannerPosition: data.bannerPosition,
    };
    
    try {
        const result = await generateEmailBlast(payload);
        setSubject(result.subject);
        setBodyContent(result.body);
        toast({ title: 'Sukses!', description: 'Konten email berhasil dibuat oleh AI.' });
    } catch(err) {
        toast({ variant: 'destructive', title: 'Gagal Membuat Email', description: (err as Error).message });
    } finally {
        setIsLoading(false);
    }
  };
  
  useEffect(() => {
    if (iframeRef.current && bodyContent) {
      const iframeDoc = iframeRef.current.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(bodyContent);
        iframeDoc.close();
      }
    }
  }, [bodyContent]);

  const handleOpenClient = (client: 'gmail' | 'outlook') => {
    if (!subject.trim()) {
      toast({ variant: 'destructive', title: 'Subjek kosong', description: 'Harap isi subjek email.' });
      return;
    }
    if (!bodyContent.trim()) {
      toast({ variant: 'destructive', title: 'Isi email kosong', description: 'Harap buat atau tulis isi email.' });
      return;
    }

    navigator.clipboard.write([
        new ClipboardItem({ 'text/html': new Blob([bodyContent], { type: 'text/html' }) })
    ]).then(() => {
        toast({
            title: 'Konten Email Telah Disalin!',
            description: 'Anda sekarang dapat menempelkannya (paste) di aplikasi email Anda.',
        });
        
        let mailUrl = '';
        const encodedSubject = encodeURIComponent(subject);
        const recipients = recipientEmails.join(',');

        if (client === 'gmail') {
          const encodedRecipients = encodeURIComponent(recipients);
          mailUrl = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodedRecipients}&su=${encodedSubject}`;
        } else {
          mailUrl = `mailto:?bcc=${recipients}&subject=${encodedSubject}`;
        }
        
        window.open(mailUrl, '_blank');

    }).catch(err => {
        console.error('Failed to copy HTML content: ', err);
        toast({
            variant: 'destructive',
            title: 'Gagal Menyalin Otomatis',
            description: 'Silakan salin konten secara manual dari pratinjau.',
        });
    });
  };

  const renderAiFormFields = () => {
    switch (watchedEmailType) {
        case 'thanksLetter':
            return (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nama Acara</Label>
                            <Input {...form.register('eventName')} placeholder="Webinar ZWCAD 2025"/>
                        </div>
                        <div className="space-y-2">
                             <Label>Tanggal Acara</Label>
                            <Controller name="eventDate" control={form.control} render={({ field }) => <DatePicker date={field.value} setDate={field.onChange} />} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Poin Kunci yang Dibahas</Label>
                        <Textarea {...form.register('eventKeyPoints')} placeholder="1. Fitur Smart Mouse baru..." />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Controller name="offerDemo" control={form.control} render={({ field }) => <Checkbox id="offerDemo" checked={field.value} onCheckedChange={field.onChange} />} />
                        <Label htmlFor="offerDemo">Tawarkan sesi demo personal di email?</Label>
                    </div>
                </div>
            );
        case 'promotion':
             return (
                <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Produk yang Dipromosikan</Label>
                             <Controller name="promoProduct" control={form.control} render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue placeholder="Pilih produk..." /></SelectTrigger>
                                    <SelectContent>
                                        {PRODUCT_LIST.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )} />
                        </div>
                        <div className="space-y-2">
                            <Label>Target Audiens</Label>
                            <Input {...form.register('promoTargetAudience')} placeholder="Pengguna Sketchup"/>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Detail Penawaran/Promo</Label>
                        <Textarea {...form.register('promoDetails')} placeholder="Diskon 25% hingga akhir bulan..." />
                    </div>
                    <div className="space-y-2">
                        <Label>Call-to-Action (CTA)</Label>
                        <Input {...form.register('promoCTA')} placeholder="Klaim promo di website kami"/>
                    </div>
                </div>
            );
        case 'invitation':
            return (
                <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Judul Acara</Label>
                            <Input {...form.register('invitationTitle')} placeholder="Webinar ZW3D Advanced"/>
                        </div>
                        <div className="space-y-2">
                            <Label>Tanggal & Waktu</Label>
                            <Input {...form.register('invitationDateTime')} placeholder="Jumat, 25 Okt 2024, 14:00 WIB" />
                        </div>
                         <div className="space-y-2">
                            <Label>Pembicara (Opsional)</Label>
                            <Input {...form.register('invitationSpeakers')} placeholder="Budi Santoso, Product Manager"/>
                        </div>
                        <div className="space-y-2">
                             <Label>Tipe Acara</Label>
                            <Controller name="invitationType" control={form.control} render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Online">Online</SelectItem>
                                        <SelectItem value="Offline">Offline</SelectItem>
                                    </SelectContent>
                                </Select>
                            )} />
                        </div>
                     </div>
                     <div className="space-y-2">
                        <Label>Benefit Utama untuk Peserta</Label>
                        <Textarea {...form.register('invitationBenefits')} placeholder="1. Belajar teknik CAM terbaru..." />
                    </div>
                    {watchedInvitationType === 'Online' ? (
                        <div className="space-y-2">
                            <Label>Link Pendaftaran</Label>
                            <Input {...form.register('invitationRegistrationLink')} placeholder="https://link-registrasi.com"/>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nama & Alamat Lokasi</Label>
                                <Input {...form.register('invitationLocationName')} placeholder="Hotel Indonesia, Jakarta"/>
                            </div>
                            <div className="space-y-2">
                                <Label>Link Google Maps</Label>
                                <Input {...form.register('invitationMapLink')} placeholder="https://maps.app.goo.gl/..."/>
                            </div>
                        </div>
                    )}
                </div>
            )
        case 'news':
            return (
                <div className="space-y-2">
                    <Label>Isi Berita atau Poin Utama</Label>
                    <Textarea {...form.register('newsContent')} rows={8} placeholder="Tuliskan poin-poin utama atau draf kasar dari berita yang ingin Anda sampaikan. AI akan membantu menyempurnakannya." />
                </div>
            );
        default:
            return <Alert><AlertDescription>Pilih tipe email untuk melihat field yang relevan.</AlertDescription></Alert>
    }
  }


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-full grid-rows-[auto_1fr_auto]">
         <MediaLibrarySelector
            isOpen={isLibraryOpen}
            onOpenChange={setIsLibraryOpen}
            onAssetSelect={(asset) => {
                setSelectedAsset(asset);
                setIsLibraryOpen(false);
            }}
        />
        <DialogHeader>
          <DialogTitle>Buat Email Blast</DialogTitle>
          <DialogDescription>
            Siapkan email untuk {recipientCount} pelanggan. Pilih metode di bawah untuk membuat konten email.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid md:grid-cols-2 gap-8 py-4 overflow-y-auto" style={{ maxHeight: '75vh' }}>
            {/* Left Side: Inputs */}
            <div className="space-y-6 pr-4">
                <div className="space-y-2 sticky top-0 bg-background pt-2 z-10">
                    <Label htmlFor="subject">Subjek Email</Label>
                    <Input id="subject" placeholder="Contoh: Promo Spesial Akhir Bulan dari Piranusa" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="generate-ai"><Bot className="mr-2 h-4 w-4"/>Generate AI</TabsTrigger>
                        <TabsTrigger value="manual-input"><Type className="mr-2 h-4 w-4"/>Tulis Manual</TabsTrigger>
                        <TabsTrigger value="upload-html"><Upload className="mr-2 h-4 w-4"/>Upload HTML</TabsTrigger>
                    </TabsList>
                    
                    {/* -- AI GENERATOR TAB -- */}
                    <TabsContent value="generate-ai" className="mt-4">
                        <form id="ai-email-form" onSubmit={form.handleSubmit(handleGenerateAI)} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Tipe Email</Label>
                                <Controller name="emailType" control={form.control} render={({ field }) => (
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <SelectTrigger><SelectValue placeholder="Pilih tipe email..." /></SelectTrigger>
                                        <SelectContent>
                                            {emailTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )} />
                            </div>
                            
                            {renderAiFormFields()}
                            
                            <div className="space-y-2 border-t pt-4">
                                <Label>Tata Letak & Gambar Banner (Opsional)</Label>
                                <div className="p-4 border rounded-lg space-y-4 bg-muted/50">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Posisi Banner</Label>
                                            <Controller name="bannerPosition" control={form.control} render={({ field }) => (
                                                <Select onValueChange={field.onChange} value={field.value} disabled={!selectedAsset}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Tanpa Banner</SelectItem>
                                                        <SelectItem value="top">Di Atas (Header)</SelectItem>
                                                        <SelectItem value="middle">Di Tengah</SelectItem>
                                                        <SelectItem value="bottom">Di Bawah</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )} />
                                        </div>
                                         <div className="space-y-2">
                                            <Label>Pilih Gambar</Label>
                                            <Button type="button" variant="outline" className="w-full" onClick={() => setIsLibraryOpen(true)}>
                                                <ImageIcon className="mr-2 h-4 w-4"/>
                                                {selectedAsset ? 'Ganti Gambar' : 'Pilih dari Library'}
                                            </Button>
                                        </div>
                                    </div>
                                    {selectedAsset && (
                                        <div className="relative p-2 border rounded-md bg-background flex items-center gap-4">
                                            <Image src={selectedAsset.imageUrl} alt={selectedAsset.assetName} width={64} height={48} className="rounded-sm object-cover" />
                                            <div className="flex-1">
                                                <p className="text-sm font-medium leading-tight">{selectedAsset.assetName}</p>
                                                <p className="text-xs text-muted-foreground line-clamp-1">{selectedAsset.tags?.join(', ')}</p>
                                            </div>
                                            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => setSelectedAsset(null)}>
                                                <XCircle className="w-4 h-4 text-destructive" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <Button type="submit" disabled={isLoading} className="w-full">
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Bot className="mr-2 h-4 w-4"/>}
                                {isLoading ? 'Membuat Email...' : 'Generate Konten Email dengan AI'}
                            </Button>
                        </form>
                    </TabsContent>
                    
                    {/* -- MANUAL INPUT TAB -- */}
                    <TabsContent value="manual-input" className="mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="manual-body">Isi Email (Mendukung HTML)</Label>
                            <Textarea id="manual-body" value={bodyContent} onChange={e => setBodyContent(e.target.value)} rows={15} placeholder="Tulis atau tempel kode HTML Anda di sini." />
                        </div>
                    </TabsContent>
                    
                    {/* -- UPLOAD HTML TAB -- */}
                    <TabsContent value="upload-html" className="mt-4">
                         <div className="space-y-2">
                            <Label htmlFor="html-upload">File Template Email (.html)</Label>
                            <Input id="html-upload" type="file" accept=".html" onChange={handleFileChange} className="text-xs" />
                             {fileName && activeTab === 'upload-html' && (
                                <div className="mt-2 flex items-center justify-between p-2 bg-secondary rounded-md text-sm">
                                    <span className="truncate">{fileName}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => { setBodyContent(''); setFileName(''); }}>
                                        <XCircle className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
                <div className='mt-6 space-y-4'>
                     <Label>Lanjutkan dan Kirim</Label>
                     <Alert>
                        <Copy className="h-4 w-4" />
                        <AlertTitle>Konten Akan Otomatis Disalin!</AlertTitle>
                        <AlertDescription>
                            Saat Anda menekan tombol "Lanjutkan", konten email akan disalin ke clipboard Anda. Cukup `paste` (Ctrl+V) di badan email.
                        </AlertDescription>
                    </Alert>
                    <div className='w-full grid grid-cols-1 sm:grid-cols-2 gap-2'>
                        <Button onClick={() => handleOpenClient('gmail')} disabled={!bodyContent || !subject} className='bg-red-600 hover:bg-red-700 text-white'>
                            <ExternalLink className="mr-2 h-4 w-4" /> Lanjutkan ke Gmail
                        </Button>
                        <Button onClick={() => handleOpenClient('outlook')} disabled={!bodyContent || !subject} className='bg-blue-600 hover:bg-blue-700 text-white'>
                            <ExternalLink className="mr-2 h-4 w-4" /> Buka Klien Email Lain
                        </Button>
                    </div>
                </div>
            </div>

            {/* Right Side: Preview */}
            <div className="space-y-2">
                <Label>Pratinjau Email</Label>
                <div className="w-full h-[65vh] border rounded-md overflow-hidden bg-white">
                    <iframe ref={iframeRef} title="Pratinjau Email" className="w-full h-full border-0" sandbox="allow-same-origin" />
                </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
