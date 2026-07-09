'use client';


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, CheckCircle2, ChevronRight, ChevronLeft, Search, Copy, ExternalLink, Bot, Upload, Type, XCircle, ImageIcon, MousePointerClick as VisitButtonIcon, LayoutTemplate, Move, Trash2, Link as LinkIcon, Palette, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';



import { Customer } from '@/types';
import { getAllCustomers } from '@/app/actions/leader';
import { generateEmailBlast, EmailGenerationInput } from '@/ai/flows/generate-email-blast-flow';
import { saveEmailBlastHistory } from '@/app/actions/email-blast'; // Server Action
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DatePicker } from '@/components/ui/date-picker';
import { MediaLibrarySelector } from '../../_components/leader/media-library-selector';
import { EmailBlastHistoryDialog } from '@/app/dashboard/_components/leader/email-blast-history';
import { openEmailClient } from '@/lib/email-sender-utils';
import Image from 'next/image';
import { FadeIn } from '@/components/ui/fade-in';

// --- Types & Schemas ---
const emailGeneratorSchema = z.object({
    emailType: z.enum(['thanksLetter', 'promotion', 'news', 'invitation']),
    eventName: z.string().optional(),
    eventDate: z.date().optional(),
    eventKeyPoints: z.string().optional(),
    offerDemo: z.boolean().optional(),
    promoProduct: z.string().optional(),
    promoTargetAudience: z.string().optional(),
    promoDetails: z.string().optional(),
    promoCTA: z.string().optional(),
    newsContent: z.string().optional(),
    invitationTitle: z.string().optional(),
    invitationDateTime: z.string().optional(), // Using string for free text time
    invitationType: z.enum(['Online', 'Offline']).optional(),
    invitationLocationName: z.string().optional(),
    invitationMapLink: z.string().optional(),
    invitationRegistrationLink: z.string().optional(),
    invitationBenefits: z.string().optional(),
    bannerPosition: z.enum(['none', 'top', 'middle', 'bottom']).optional(),
});

type EmailGeneratorFormData = z.infer<typeof emailGeneratorSchema>;

// type RecipientType = 'personal' | 'company' | 'type'; // Removed
type ContentMethod = 'generate-ai' | 'manual-input' | 'upload-html';

// Button Builder State
interface ButtonBuilderState {
    text: string;
    url: string;
    color: string;
    textColor: string;
    alignment: 'left' | 'center' | 'right';
}

// Global Style State
interface EmailStyleState {
    backgroundColor: string;
    textColor: string;
    fontFamily: string;
}

const APP_URL = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://salescore-piranusa.vercel.app');

// Helper to UPSERT (Inject or Update) the Smart Button
const upsertSmartButton = (html: string, btn: ButtonBuilderState, show: boolean, trackingLink?: string, isEditor: boolean = true) => {
    if (typeof window === 'undefined') return html; // SSR Safety

    const PLACEHOLDER = '[[SMART_BUTTON_PLACEHOLDER]]';
    const finalLink = trackingLink || btn.url;

    // 1. Generate the Core Button HTML (Clean Version for Email Clients)
    const cleanBtnHtml = `
            <table width="100%" border="0" cellspacing="0" cellpadding="0" class="smart-btn-clean">
            <tr>
                <td align="${btn.alignment}">
                <a href="${finalLink}" 
                    target="_blank" 
                    style="display: inline-block; background-color: ${btn.color}; color: ${btn.textColor}; font-family: Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    ${btn.text}
                </a>
                </td>
            </tr>
            </table>`;

    // 2. Generate the Editor Wrapper (Dashed Lines, Drag Handle) - OR use clean version
    // Persist ID if exists to avoid flickers
    const btnUID = Math.random().toString(36).substr(2, 9);

    const editorBtnHtml = `
    <div 
        id="btn-${btnUID}" 
        class="smart-btn-wrapper" 
        contenteditable="false" 
        draggable="true" 
        data-text="${btn.text}"
        data-url="${finalLink}"
        data-color="${btn.color}"
        data-text-color="${btn.textColor}"
        data-alignment="${btn.alignment}"
        style="display: block; margin: 16px 0; padding: 8px; cursor: grab; border: 2px dashed rgba(37,99,235, 0.2); transition: all 0.2s; user-select: none; position: relative;"
        onmouseenter="this.style.borderColor='#2563eb'; this.style.backgroundColor='rgba(37,99,235, 0.05)'"
        onmouseleave="this.style.borderColor='rgba(37,99,235, 0.2)'; this.style.backgroundColor='transparent'"
    >
        <div style="pointer-events: none;">
            ${cleanBtnHtml}
        </div>
        <div style="position: absolute; top: -10px; right: -10px; background: #2563eb; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;" class="drag-handle-hint">
            Drag
        </div>
    </div>`;

    const finalHtmlToInsert = isEditor ? editorBtnHtml : cleanBtnHtml;

    // 3. Logic: Replace Placeholder OR Insert
    // First, check if we can simply replace the placeholder
    if (html.includes(PLACEHOLDER)) {
        if (!show) return html.replace(PLACEHOLDER, ''); // Remove placeholder if hidden
        return html.replace(PLACEHOLDER, finalHtmlToInsert);
    }

    // DRY RUN with DOM parser for advanced insertion/update
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Find existing wrapper (only applicable in Editor mode usually, or if we re-parse clean HTML)
    // In Clean mode, it's harder to find the button unless we mark it class="smart-btn-clean"
    const existingWrapper = tempDiv.querySelector(isEditor ? '.smart-btn-wrapper' : '.smart-btn-clean');

    if (!show) {
        if (existingWrapper) existingWrapper.remove();
        return tempDiv.innerHTML;
    }

    if (existingWrapper) {
        existingWrapper.outerHTML = finalHtmlToInsert;
    } else {
        // Fallback Strategy: Insert before Footer or Append
        // ... (Reusing robust logic) ...
        let rootContainer = tempDiv;
        if (tempDiv.children.length === 1 && tempDiv.firstElementChild?.tagName === 'DIV') {
            rootContainer = tempDiv.firstElementChild as HTMLDivElement;
        }

        const allElements = rootContainer.querySelectorAll('*');
        let footerElement: Element | null = null;

        for (const el of Array.from(allElements)) {
            const text = el.textContent?.toLowerCase() || '';
            if (text.includes('copyright') || text.includes('follow our social media') || text.includes('rights reserved')) {
                let current = el;
                while (current.parentElement && current.parentElement !== rootContainer) {
                    current = current.parentElement;
                }
                footerElement = current;
                break;
            }
        }

        if (footerElement) {
            footerElement.insertAdjacentHTML('beforebegin', finalHtmlToInsert);
        } else {
            rootContainer.insertAdjacentHTML('beforeend', finalHtmlToInsert);
        }
    }

    return tempDiv.innerHTML;
};


const CUSTOMER_SOURCES = ['LinkedIn', 'Website', 'Event', 'Referral', 'Outbound'];
const PRODUCT_LIST = ['ZWCAD 2025', 'ZW3D 2025', 'ZWCAD Mechanical', 'ZWCAD Architecture'];

export default function EmailBlastView() {
    const { toast } = useToast();
    const { userProfile } = useAuth();

    // Global State
    const [currentStep, setCurrentStep] = useState(1);
    const [isSent, setIsSent] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);

    useEffect(() => {
        const fetchCustomers = async () => {
            if (!userProfile) return;
            setIsLoadingCustomers(true);
            try {
                // Pass userProfile to ensure data isolation (AEC vs MFG)
                const data = await getAllCustomers(userProfile);
                setCustomers(data);
            } catch (error) {
                console.error("Failed to fetch customers", error);
                toast({ variant: "destructive", title: "Gagal memuat data pelanggan", description: "Periksa koneksi internet Anda." });
            } finally {
                setIsLoadingCustomers(false);
            }
        };

        if (userProfile) {
            fetchCustomers();
        }
    }, [toast, userProfile]);

    // Recipient State (Refactored to single view)
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCompany, setSelectedCompany] = useState<string>('all');
    const [selectedSource, setSelectedSource] = useState<string>('all');
    const [selectedEventName, setSelectedEventName] = useState<string>('all');

    // Content State
    const [contentMethod, setContentMethod] = useState<ContentMethod>('generate-ai');
    const [subject, setSubject] = useState('');
    const [bodyContent, setBodyContent] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Media Library
    const [selectedAsset, setSelectedAsset] = useState<{ id: string, imageUrl: string, assetName: string } | null>(null);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);

    // Tracking & Tools
    const [blastId] = useState(() => `blast_${Math.random().toString(36).substr(2, 9)}`);
    const [buttonBuilder, setButtonBuilder] = useState<ButtonBuilderState>({
        text: 'Hubungi Kami',
        url: 'https://wa.me/62...',
        color: '#2563eb',
        textColor: '#ffffff',
        alignment: 'center'
    });

    // Simplified Email Styler State
    const [emailStyle, setEmailStyle] = useState<{ alignment: 'left' | 'center' | 'right' | 'justify' }>({
        alignment: 'left'
    });



    // Apply Styles Effect - Simple Regex replacement for the main wrapper styles
    // Apply Styles Effect - Simple Regex replacement for the main wrapper styles
    useEffect(() => {
        if (!bodyContent) return;
        // Naive style application - just for awareness, actual change happens in the visual editor toolbar handlers
    }, [emailStyle]);

    // Live Update Smart Button


    // --- Editor Interaction Handlers ---


    // Update Body Content from Visual Editor
    const handleVisualEdit = (newHtml: string) => {
        setBodyContent(newHtml);
    };


    // AI Form

    const form = useForm<EmailGeneratorFormData>({
        resolver: zodResolver(emailGeneratorSchema),
        defaultValues: {
            emailType: 'thanksLetter',
            bannerPosition: 'none',
            offerDemo: false // Default false
        }
    });

    const watchedEmailType = form.watch('emailType');
    const watchedInvitationType = form.watch('invitationType');
    const watchedOfferDemo = form.watch('offerDemo');

    // Live Update Smart Button
    useEffect(() => {
        // Use functional update to avoid depending on 'bodyContent' in the effect dependency array.
        // This prevents the infinite loop: render -> effect -> setBodyContent -> render
        setBodyContent((currentContent) => {
            if (!currentContent) return currentContent;

            // Only update state if string actually changed (React does this check too, but good to be explicit)
            // User requested CLEAN preview (no dashed lines), so we pass isEditor=false
            const updated = upsertSmartButton(currentContent, buttonBuilder, watchedOfferDemo || false, undefined, false);
            return updated !== currentContent ? updated : currentContent;
        });
    }, [buttonBuilder, watchedOfferDemo]);


    // --- Derived Data ---
    const uniqueCompanies = useMemo(() => Array.from(new Set(customers.map(c => c.company).filter(Boolean))).sort(), [customers]);
    const uniqueEvents = useMemo(() => Array.from(new Set(customers.map(c => c.acquisitionContext?.eventName).filter(Boolean))).sort(), [customers]);
    const uniqueSources = useMemo(() => Array.from(new Set(customers.map(c => c.acquisitionContext?.source).filter(Boolean))).sort(), [customers]);

    const filteredSelectionSource = useMemo(() => {
        let filtered = customers;

        // 1. Text Search (Name/Email)
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(c =>
                c.name.toLowerCase().includes(lower) ||
                c.email.toLowerCase().includes(lower)
            );
        }

        // 2. Company Filter
        if (selectedCompany !== 'all') {
            filtered = filtered.filter(c => c.company === selectedCompany);
        }

        // 3. Source Filter
        if (selectedSource !== 'all') {
            filtered = filtered.filter(c => c.acquisitionContext?.source === selectedSource);
        }

        // 4. Event Filter
        if (selectedEventName !== 'all') {
            filtered = filtered.filter(c => c.acquisitionContext?.eventName === selectedEventName);
        }

        return filtered;
    }, [customers, searchTerm, selectedCompany, selectedSource, selectedEventName]);


    // --- Handlers ---
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            // Select all currently filtered items that are not already selected
            const visibleIds = filteredSelectionSource.map(c => c.id);
            // Union of current selection and visible items
            setSelectedCustomers(prev => Array.from(new Set([...prev, ...visibleIds])));
        } else {
            // Deselect all currently visible items
            const visibleIds = filteredSelectionSource.map(c => c.id);
            setSelectedCustomers(prev => prev.filter(id => !visibleIds.includes(id)));
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedCustomers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleGenerateAI = async (data: EmailGeneratorFormData) => {
        setIsGenerating(true);
        const payload: EmailGenerationInput = {
            ...data,
            eventDate: data.eventDate?.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
            bannerImageUrl: selectedAsset?.imageUrl,
            bannerPosition: data.bannerPosition || 'none',
        };

        try {
            const result = await generateEmailBlast(payload);
            setSubject(result.subject);
            setBodyContent(result.body);
            toast({ title: 'Sukses!', description: 'Konten email berhasil dibuat oleh AI.' });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Gagal Membuat Email', description: (err as Error).message });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.includes('html')) {
            toast({ variant: 'destructive', title: 'File Tidak Valid', description: 'Harap unggah file .html' });
            return;
        }
        const reader = new FileReader();
        reader.onloadstart = () => setIsGenerating(true);
        reader.onload = (e) => {
            setBodyContent(e.target?.result as string);
            setFileName(file.name);
            setIsGenerating(false);
        };
        reader.readAsText(file);
    };

    const handleOpenClient = async (client: 'gmail' | 'outlook') => {
        if (!selectedCustomers.length) return;

        const recipientList = customers
            .filter(c => selectedCustomers.includes(c.id))
            .map(c => c.email)
            .filter(Boolean) as string[];

        // Logic Injection for Smart Button (Tracking)
        let finalBodyContent = bodyContent;
        if (watchedOfferDemo) {
            const trackingLink = `${APP_URL}/api/track?url=${encodeURIComponent(buttonBuilder.url)}&bid=${blastId}`;
            // Use upsert to replace the existing visual button with the tracking one AND CLEAN FORMAT (isEditor=false)
            finalBodyContent = upsertSmartButton(bodyContent, buttonBuilder, true, trackingLink, false);
        }

        const success = await openEmailClient(
            client,
            subject,
            finalBodyContent,
            recipientList,
            (msg) => toast({ title: 'Sukses', description: msg }),
            (err) => toast({ variant: 'destructive', title: 'Gagal', description: err })
        );

        if (success) {
            setIsSent(true);
            // Save to History (Using Server Action)
            saveEmailBlastHistory({
                id: blastId, // Use the generated ID to link with tracking
                subject,
                content: finalBodyContent, // Save the version WITH the button
                recipientCount: selectedCustomers.length,
                recipients: recipientList,
                emailType: 'blast',
                userEmail: 'user@current', // Ideally pass real user email
            }).catch(err => console.error("Failed to save history:", err));

        }
    };


    useEffect(() => {
        if (iframeRef.current && bodyContent) {
            const doc = iframeRef.current.contentWindow?.document;
            if (doc) {
                doc.open();
                doc.write(bodyContent);
                doc.close();
            }
        }
    }, [bodyContent, currentStep]);


    // --- Render Helpers ---



    // Helper to render AI fields (Copy-pasted logic from dialog)
    const renderAiFormFields = () => {
        switch (watchedEmailType) {
            case 'thanksLetter':
                return (
                    <div className="space-y-3">
                        <Input {...form.register('eventName')} placeholder="Nama Acara e.g. Webinar ZWCAD" />
                        <Controller name="eventDate" control={form.control} render={({ field }) => <DatePicker date={field.value} setDate={field.onChange} />} />
                        <Textarea {...form.register('eventKeyPoints')} placeholder="Poin kunci..." />
                        <div className="flex items-center gap-2">
                            <Controller name="offerDemo" control={form.control} render={({ field }) => <Checkbox id="offerDemo" checked={field.value} onCheckedChange={field.onChange} />} />
                            <Label htmlFor="offerDemo">Tawarkan Demo?</Label>
                        </div>

                        {/* Button Configuration Restored */}
                        {watchedOfferDemo && (
                            <div className="mt-4 border rounded-lg p-4 bg-slate-50 space-y-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                        <LayoutTemplate className="h-4 w-4 text-blue-600" />
                                        Konfigurasi Tombol Demo
                                    </h4>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Teks</Label>
                                        <Input
                                            value={buttonBuilder.text}
                                            onChange={e => setButtonBuilder({ ...buttonBuilder, text: e.target.value })}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Link (WA/Web)</Label>
                                        <Input
                                            value={buttonBuilder.url}
                                            onChange={e => setButtonBuilder({ ...buttonBuilder, url: e.target.value })}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Alignment</Label>
                                        <Select value={buttonBuilder.alignment} onValueChange={(v: any) => setButtonBuilder({ ...buttonBuilder, alignment: v })}>
                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="left">Kiri</SelectItem>
                                                <SelectItem value="center">Tengah</SelectItem>
                                                <SelectItem value="right">Kanan</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Style</Label>
                                        <div className="flex gap-1">
                                            <Input type="color" value={buttonBuilder.color} onChange={e => setButtonBuilder({ ...buttonBuilder, color: e.target.value })} className="h-7 w-8 p-0 border-0" title="Background" />
                                            <Input type="color" value={buttonBuilder.textColor} onChange={e => setButtonBuilder({ ...buttonBuilder, textColor: e.target.value })} className="h-7 w-8 p-0 border-0" title="Text" />
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    Tombol ini akan otomatis disisipkan setelah email dibuat.
                                </p>
                            </div>
                        )}
                    </div>
                );
            case 'promotion':
                return (
                    <div className="space-y-3">
                        <Controller name="promoProduct" control={form.control} render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger><SelectValue placeholder="Produk" /></SelectTrigger>
                                <SelectContent>{PRODUCT_LIST.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                            </Select>
                        )} />
                        <Input {...form.register('promoTargetAudience')} placeholder="Target Audiens" />
                        <Textarea {...form.register('promoDetails')} placeholder="Detail Promo..." />
                        <Input {...form.register('promoCTA')} placeholder="Call to Action" />
                    </div>
                );
            case 'news':
                return <Textarea {...form.register('newsContent')} rows={5} placeholder="Isi berita..." />;
            case 'invitation':
                return (
                    <div className="space-y-3">
                        <Input {...form.register('invitationTitle')} placeholder="Judul Acara" />
                        <Input {...form.register('invitationDateTime')} placeholder="Waktu (Free text)" />
                        <Controller name="invitationType" control={form.control} render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Online">Online</SelectItem><SelectItem value="Offline">Offline</SelectItem></SelectContent>
                            </Select>
                        )} />
                        <Textarea {...form.register('invitationBenefits')} placeholder="Benefit..." />
                        {watchedInvitationType === 'Online' ?
                            <Input {...form.register('invitationRegistrationLink')} placeholder="Link Registrasi" /> :
                            <><Input {...form.register('invitationLocationName')} placeholder="Lokasi" /><Input {...form.register('invitationMapLink')} placeholder="Link Map" /></>
                        }
                    </div>
                );
            default: return null;
        }
    };




    const emailTypeOptions = [
        { value: 'thanksLetter', label: 'Ucapan Terima Kasih (Event)' },
        { value: 'promotion', label: 'Promosi Produk' },
        { value: 'news', label: 'Berita / Update' },
        { value: 'invitation', label: 'Undangan' },
    ];

    return (
        <FadeIn>
            <Card className="min-h-[85vh] flex flex-col">
                <CardHeader className="border-b pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl font-bold font-headline">Email Blast</CardTitle>
                            <CardDescription className="mt-1">Buat dan kirim kampanye email ke pelanggan Anda.</CardDescription>
                        </div>
                        <EmailBlastHistoryDialog />
                    </div>

                    {/* Stepper Wizard Indicator - Moved inside Header for better UX */}
                    <div className="flex items-center justify-center space-x-4 pt-6 pb-2">
                        <div className="flex items-center flex-1 justify-end">
                            <div className={`flex flex-col items-center ${currentStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 mb-1 font-bold text-sm ${currentStep >= 1 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted'}`}>1</div>
                                <span className="text-[10px] uppercase tracking-wider font-semibold">Penerima</span>
                            </div>
                        </div>
                        <div className={`w-16 h-[2px] relative top-[-10px] ${currentStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                        <div className="flex items-center">
                            <div className={`flex flex-col items-center ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 mb-1 font-bold text-sm ${currentStep >= 2 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted'}`}>2</div>
                                <span className="text-[10px] uppercase tracking-wider font-semibold">Konten</span>
                            </div>
                        </div>
                        <div className={`w-16 h-[2px] relative top-[-10px] ${currentStep >= 3 ? 'bg-primary' : 'bg-muted'}`} />
                        <div className="flex items-center flex-1 justify-start">
                            <div className={`flex flex-col items-center ${currentStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 mb-1 font-bold text-sm ${currentStep >= 3 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted'}`}>3</div>
                                <span className="text-[10px] uppercase tracking-wider font-semibold">Kirim</span>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 p-6">
                    <MediaLibrarySelector
                        isOpen={isLibraryOpen}
                        onOpenChange={setIsLibraryOpen}
                        onAssetSelect={(asset) => {
                            setSelectedAsset(asset);
                            setIsLibraryOpen(false);
                        }}
                    />

                    {currentStep === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="space-y-1 mb-4">
                                <h3 className="text-lg font-semibold">Pilih Penerima</h3>
                                <p className="text-sm text-muted-foreground">Pilih pelanggan yang akan menerima email ini.</p>
                            </div>

                            {/* Unified Filter Bar */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/40 rounded-lg items-end border">
                                {/* 1. Search */}
                                <div className="md:col-span-1 space-y-2">
                                    <Label>Cari (Nama/Email)</Label>
                                    <div className="relative">
                                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Cari..."
                                            className="pl-8 bg-white"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* 2. Company Filter */}
                                <div className="md:col-span-1 space-y-2">
                                    <Label>Perusahaan</Label>
                                    <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                                        <SelectTrigger className="bg-white"><SelectValue placeholder="Semua Perusahaan" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Semua Perusahaan</SelectItem>
                                            {uniqueCompanies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* 3. Source Filter */}
                                <div className="md:col-span-1 space-y-2">
                                    <Label>Source / Asal</Label>
                                    <Select value={selectedSource} onValueChange={setSelectedSource}>
                                        <SelectTrigger className="bg-white"><SelectValue placeholder="Semua Source" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Semua Source</SelectItem>
                                            {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* 4. Event Filter */}
                                <div className="md:col-span-1 space-y-2">
                                    <Label>Event</Label>
                                    <Select value={selectedEventName} onValueChange={setSelectedEventName}>
                                        <SelectTrigger className="bg-white"><SelectValue placeholder="Semua Event" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Semua Event</SelectItem>
                                            {uniqueEvents.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Standard Table UI */}
                            <div className="rounded-md border bg-white shadow-sm">
                                <div className="p-2 border-b bg-muted/20 flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground px-2">
                                        Menampilkan {filteredSelectionSource.length} dari {customers.length} data
                                    </span>
                                    <div className='flex gap-2 items-center'>
                                        <Badge variant="secondary">
                                            {selectedCustomers.length} Terpilih
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs text-muted-foreground hover:text-red-500"
                                            onClick={() => setSelectedCustomers([])}
                                            disabled={selectedCustomers.length === 0}
                                        >
                                            Reset Pilihan
                                        </Button>
                                    </div>
                                </div>
                                <ScrollArea className="h-[400px]">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px] text-center">
                                                    <Checkbox
                                                        checked={filteredSelectionSource.length > 0 && filteredSelectionSource.every(c => selectedCustomers.includes(c.id))}
                                                        onCheckedChange={handleSelectAll}
                                                    />
                                                </TableHead>
                                                <TableHead>Nama</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Perusahaan</TableHead>
                                                <TableHead>Source</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoadingCustomers ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-24 text-center">
                                                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : filteredSelectionSource.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                        Tidak ada data yang cocok dengan filter.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredSelectionSource.map((customer) => (
                                                    <TableRow key={customer.id} className="hover:bg-muted/50" onClick={() => toggleSelection(customer.id)}>
                                                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                            <Checkbox
                                                                checked={selectedCustomers.includes(customer.id)}
                                                                onCheckedChange={() => toggleSelection(customer.id)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="font-medium">{customer.name}</TableCell>
                                                        <TableCell>{customer.email}</TableCell>
                                                        <TableCell>{customer.company || '-'}</TableCell>
                                                        <TableCell>
                                                            <div className='flex flex-col text-xs'>
                                                                <span>{customer.acquisitionContext?.source || '-'}</span>
                                                                <span className='text-muted-foreground text-[10px]'>{customer.acquisitionContext?.eventName}</span>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button onClick={() => setCurrentStep(2)} disabled={selectedCustomers.length === 0}>
                                    Lanjut ke Konten <ChevronRight className="ml-2 h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="grid lg:grid-cols-2 gap-8 h-full min-h-[500px] animate-in fade-in slide-in-from-right-4 duration-500">
                            {/* Editor Column */}
                            <div className="flex flex-col h-full space-y-4 overflow-y-auto pr-2 border-r pr-8">
                                <div className="space-y-1">
                                    <h3 className="text-lg font-semibold">Buat Konten Email</h3>
                                    <p className="text-sm text-muted-foreground">Tulis manual, gunakan AI, atau upload HTML.</p>
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="subject">Subjek Email</Label>
                                        <Input id="subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Contoh: Undangan Eksklusif Webinar" />
                                    </div>

                                    <Tabs value={contentMethod} onValueChange={(v: any) => setContentMethod(v)} className="w-full h-full flex flex-col">
                                        <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="generate-ai"><Bot className="mr-2 h-4 w-4" /> AI Assist</TabsTrigger>
                                            <TabsTrigger value="manual-input"><Type className="mr-2 h-4 w-4" /> Manual</TabsTrigger>
                                            <TabsTrigger value="upload-html"><Upload className="mr-2 h-4 w-4" /> HTML File</TabsTrigger>
                                        </TabsList>

                                        <div className="mt-4 flex-1">
                                            {contentMethod === 'generate-ai' && (
                                                <form onSubmit={form.handleSubmit(handleGenerateAI)} className="space-y-4">
                                                    <div className="space-y-2">
                                                        <Label>Tipe Email</Label>
                                                        <Controller name="emailType" control={form.control} render={({ field }) => (
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                                <SelectContent>{emailTypeOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                        )} />
                                                    </div>
                                                    {renderAiFormFields()}
                                                    <Separator className="my-4" />
                                                    <div className="space-y-2">
                                                        <Label>Gambar Banner (Opsional)</Label>
                                                        <div className="flex gap-2 items-center">
                                                            <Button type="button" variant="outline" onClick={() => setIsLibraryOpen(true)} className="w-full">
                                                                <ImageIcon className="mr-2 h-4 w-4" /> {selectedAsset ? 'Ganti Gambar' : 'Pilih dari Library'}
                                                            </Button>
                                                        </div>
                                                        {selectedAsset && (
                                                            <div className="relative mt-2 border rounded p-2 flex items-center gap-2">
                                                                <Image src={selectedAsset.imageUrl} alt="selected" width={50} height={50} className="rounded object-cover" />
                                                                <span className="text-xs truncate flex-1">{selectedAsset.assetName}</span>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedAsset(null)}><XCircle className="h-4 w-4" /></Button>
                                                            </div>
                                                        )}
                                                        {selectedAsset && (
                                                            <Controller name="bannerPosition" control={form.control} render={({ field }) => (
                                                                <Select onValueChange={field.onChange} value={field.value || 'none'}>
                                                                    <SelectTrigger className="mt-2"><SelectValue placeholder="Posisi Banner" /></SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="none">Sembunyikan</SelectItem>
                                                                        <SelectItem value="top">Atas</SelectItem>
                                                                        <SelectItem value="middle">Tengah</SelectItem>
                                                                        <SelectItem value="bottom">Bawah</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            )} />
                                                        )}
                                                    </div>

                                                    <Button type="submit" disabled={isGenerating} className="w-full">
                                                        {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                                                        Generate Draft
                                                    </Button>
                                                </form>
                                            )}

                                            {contentMethod === 'manual-input' && (
                                                <Textarea
                                                    className="h-[300px] font-mono text-xs"
                                                    value={bodyContent}
                                                    onChange={e => setBodyContent(e.target.value)}
                                                    placeholder="Tulis HTML di sini..."
                                                />
                                            )}

                                            {contentMethod === 'upload-html' && (
                                                <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-4">
                                                    <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                                                    <div className="text-sm text-muted-foreground">
                                                        <label htmlFor="html-upload" className="cursor-pointer text-primary hover:underline">Upload file .html</label>
                                                    </div>
                                                    <Input id="html-upload" type="file" accept=".html" className="hidden" onChange={handleFileChange} />
                                                    {fileName && <div className="text-sm font-medium">{fileName}</div>}
                                                </div>
                                            )}
                                        </div>
                                    </Tabs>
                                </div>
                                <div className="flex justify-between border-t pt-4 mt-auto">
                                    <Button variant="outline" onClick={() => setCurrentStep(1)}><ChevronLeft className="mr-2 h-4 w-4" /> Kembali</Button>
                                    <Button onClick={() => setCurrentStep(3)} disabled={!subject || !bodyContent} >Lanjut ke Pengiriman <ChevronRight className="ml-2 h-4 w-4" /></Button>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: VISUAL EDITOR & REVIEW */}
                            <div className="flex flex-col h-full bg-white border-l">
                                <div className="flex items-center justify-between p-4 border-b">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold">Live Editor</h3>
                                        <Badge variant="secondary" className="text-xs">
                                            <ExternalLink className="h-3 w-3 mr-1" /> Preview Node
                                        </Badge>
                                    </div>
                                    {/* Action Buttons Removed as per request */}
                                </div>

                                {/* Smart Styler Toolbar */}
                                <div className="flex flex-col bg-slate-50 border-b">
                                    <div className="flex items-center gap-4 py-2 px-4 text-xs overflow-x-auto justify-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground font-medium">Global Alignment:</span>
                                            <div className="flex bg-white border rounded p-1 gap-1">
                                                {(['left', 'center', 'right'] as const).map((align) => (
                                                    <Button
                                                        key={align}
                                                        variant={emailStyle.alignment === align ? 'secondary' : 'ghost'}
                                                        size="icon" className="h-6 w-6"
                                                        onClick={() => {
                                                            setEmailStyle({ ...emailStyle, alignment: align });

                                                            const tempDiv = document.createElement('div');
                                                            tempDiv.innerHTML = bodyContent;
                                                            let wrapper = tempDiv.firstElementChild as HTMLElement;

                                                            if (!wrapper || tempDiv.children.length > 1 || wrapper.tagName === 'STYLE' || wrapper.tagName === 'SCRIPT') {
                                                                const newWrapper = document.createElement('div');
                                                                newWrapper.innerHTML = tempDiv.innerHTML;
                                                                tempDiv.innerHTML = '';
                                                                tempDiv.appendChild(newWrapper);
                                                                wrapper = newWrapper;
                                                            }

                                                            wrapper.style.textAlign = align;
                                                            setBodyContent(tempDiv.innerHTML);
                                                        }}>
                                                        {align === 'left' && <AlignLeft className="w-3 h-3" />}
                                                        {align === 'center' && <AlignCenter className="w-3 h-3" />}
                                                        {align === 'right' && <AlignRight className="w-3 h-3" />}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Helper Text - New Line */}
                                    <div className="px-4 py-1.5 bg-slate-100 border-t text-[10px] text-muted-foreground flex items-center justify-center gap-1.5 select-none">
                                        <Move className="w-3 h-3" />
                                        <span>Klik langsung pada area preview di bawah untuk mengedit teks secara manual</span>
                                    </div>
                                </div>

                                {/* Editor Area */}
                                <div className="flex-1 overflow-y-auto bg-slate-100 p-8 relative">
                                    {bodyContent ? (
                                        <div className="min-h-[600px] w-full max-w-[600px] mx-auto bg-white shadow-xl rounded-lg overflow-hidden ring-1 ring-slate-200">
                                            <div
                                                className="outline-none min-h-[600px] h-full p-8 email-editor-content"
                                                contentEditable
                                                suppressContentEditableWarning
                                                onBlur={(e) => handleVisualEdit(e.currentTarget.innerHTML)}
                                                dangerouslySetInnerHTML={{ __html: bodyContent }}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50 select-none">
                                            <LayoutTemplate className="w-16 h-16 mb-4 stroke-1" />
                                            <p className="font-medium">Area Preview</p>
                                            <p className="text-sm">Konten email akan muncul di sini</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="max-w-2xl mx-auto space-y-8 py-10 animate-in zoom-in-95 duration-500">
                            {isSent ? (
                                <div className="text-center space-y-6">
                                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                        <CheckCircle2 className="w-10 h-10" />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-bold font-headline">Blast Berhasil Dikirim!</h2>
                                        <p className="text-muted-foreground text-lg">
                                            Aplikasi email Anda telah dibuka. Jangan lupa untuk memeriksa folder "Sent" Anda nanti.
                                        </p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                                        <Button size="lg" variant="outline" onClick={() => { setIsSent(false); setCurrentStep(1); setSelectedCustomers([]); }}>
                                            <Mail className="mr-2 h-4 w-4" /> Buat Blast Baru
                                        </Button>
                                        <EmailBlastHistoryDialog trigger={
                                            <Button size="lg">
                                                Lihat Riwayat Blast
                                            </Button>
                                        } />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="text-center space-y-2">
                                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Mail className="w-8 h-8" />
                                        </div>
                                        <h2 className="text-2xl font-bold">Siap Mengirim!</h2>
                                        <p className="text-muted-foreground">
                                            Anda akan mengirim email ini ke <b>{selectedCustomers.length} penerima</b>.
                                        </p>
                                        <div className="flex flex-wrap gap-2 justify-center mt-2">
                                            {selectedCustomers.slice(0, 5).map(id => {
                                                const c = customers.find(x => x.id === id);
                                                return c ? <Badge key={id} variant="secondary">{c.email}</Badge> : null;
                                            })}
                                            {selectedCustomers.length > 5 && <Badge variant="outline">+{selectedCustomers.length - 5} lainnya</Badge>}
                                        </div>
                                    </div>

                                    <Card className="border bg-slate-50/50">
                                        <CardHeader>
                                            <CardTitle>Opsi Pengiriman</CardTitle>
                                            <CardDescription>Pilih metode pengiriman email Anda.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <Alert>
                                                <Copy className="h-4 w-4" />
                                                <AlertTitle>Auto-Copy</AlertTitle>
                                                <AlertDescription>Konten HTML akan otomatis disalin ke clipboard saat Anda menekan tombol di bawah.</AlertDescription>
                                            </Alert>

                                            <div className="grid gap-4">
                                                <Button size="lg" className="w-full bg-red-600 hover:bg-red-700 text-white" onClick={() => handleOpenClient('gmail')}>
                                                    <Mail className="mr-2 h-5 w-5" /> Buka Gmail & Paste
                                                </Button>
                                                <Button size="lg" variant="outline" className="w-full" onClick={() => handleOpenClient('outlook')}>
                                                    <ExternalLink className="mr-2 h-5 w-5" /> Buka Email App Default
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <div className="flex justify-center">
                                        <Button variant="ghost" onClick={() => setCurrentStep(2)}>Kembali Edit Konten</Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card >
        </FadeIn >
    );
}
