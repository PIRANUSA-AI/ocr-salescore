

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { getCustomerById } from '@/app/actions/customer';
import type { Customer, PipelineStatus, ProductName, GenerationHistoryItem, FormAnswer } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
    ArrowLeft,
    Loader2,
    Briefcase,
    Bot,
    ScrollText,
    Save,
    PlusCircle,
    Trash2,
    Link2,
    Mail,
    Phone,
    MessageSquare,
    Copy,
    Smartphone,
    ClipboardList,
} from 'lucide-react';
import { updateCustomerDetails, updatePipelineStatus } from '@/app/actions/sales';
import { format, parseISO, isValid, formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PIPELINE_STAGES, PRODUCT_LIST } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { EmailClientDialog } from '../../components/email-client-dialog';


// --- TYPES & SCHEMAS ---

type TimelineItem = {
    type: 'Manual' | 'Webinar';
    icon: React.ElementType;
    title: string;
    content: string;
    date: Date;
};

const FormAnswerSchema = z.object({
    question: z.string(),
    answer: z.string(),
});

const ProductSchema = z.object({
    id: z.string().optional(),
    name: z.enum(PRODUCT_LIST as unknown as [string, ...string[]]),
    purchaseDate: z.date(),
    version: z.string().optional(),
    quantity: z.coerce.number().min(1).default(1),
});

const CustomerFormSchema = z.object({
    name: z.string().min(1, 'Nama wajib diisi.'),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    email: z.string().email('Email tidak valid.').optional().or(z.literal('')),
    phone: z.string().optional(),
    potentialRevenue: z.coerce.number().optional(),
    address: z.string().optional(),
    products: z.array(ProductSchema).optional(),
    formAnswers: z.array(FormAnswerSchema).optional(),
});

type CustomerFormData = z.infer<typeof CustomerFormSchema>;

// Helper function to format phone number for WhatsApp link
const formatWaLink = (phone: string | undefined | null): string => {
    if (!phone) return '#';
    let cleanedPhone = phone.replace(/[^0-9]/g, '');
    if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '62' + cleanedPhone.substring(1);
    }
    return `https://wa.me/${cleanedPhone}`;
}


export default function CustomerDetailPage() {
    const { userProfile } = useAuth();
    const router = useRouter();
    const params = useParams();
    const customerId = params.id as string;
    const isMobile = useMediaQuery("(max-width: 768px)");

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [newNote, setNewNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('timeline');
    const [emailClientState, setEmailClientState] = useState({ isOpen: false, email: '' });

    const form = useForm<CustomerFormData>({
        resolver: zodResolver(CustomerFormSchema),
        defaultValues: {
            products: [],
            formAnswers: [],
        }
    });

    const { fields: productFields, append: appendProduct, remove: removeProduct } = useFieldArray({
        control: form.control,
        name: "products"
    });

    const { fields: formAnswerFields, append: appendFormAnswer } = useFieldArray({
        control: form.control,
        name: "formAnswers"
    });

    const watchedEmail = form.watch('email');
    const watchedPhone = form.watch('phone');


    // --- DATA FETCHING ---

    const fetchCustomerData = useCallback(async () => {
        if (!customerId) return;
        if (!customer) setIsLoading(true);

        try {
            const data = await getCustomerById(customerId);
            if (data) {
                setCustomer(data);
                form.reset({
                    name: data.name || '',
                    company: data.company || '',
                    jobTitle: data.jobTitle || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    potentialRevenue: data.potentialRevenue,
                    address: data.address || '',
                    products: data.products?.map(p => ({
                        ...p,
                        purchaseDate: p.purchaseDate ? new Date(p.purchaseDate) : new Date(),
                    })) || [],
                    formAnswers: data.formAnswers || [],
                });
            } else {
                toast({ variant: 'destructive', title: 'Pelanggan tidak ditemukan' });
                router.push('/dashboard?view=my-customers');
            }
        } catch (err) {
            toast({ variant: 'destructive', title: 'Gagal memuat data', description: (err as Error).message });
        } finally {
            setIsLoading(false);
        }
    }, [customerId, router, form, customer]);

    useEffect(() => {
        fetchCustomerData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    // --- HANDLERS ---

    const handleSaveChanges = async (data: CustomerFormData) => {
        if (!customer) return;
        setIsSaving(true);
        try {
            const productsPayload = data.products?.map((p) => ({
                id: p.id,
                name: p.name as ProductName,
                purchaseDate: p.purchaseDate,
                version: p.version,
                quantity: p.quantity
            }));

            await updateCustomerDetails({
                customerId: customer.id,
                name: data.name,
                company: data.company,
                jobTitle: data.jobTitle,
                email: data.email,
                phone: data.phone,
                potentialRevenue: data.potentialRevenue,
                products: productsPayload,
                notes: newNote.trim() ? newNote.trim() : undefined,
                formAnswers: data.formAnswers,
                address: data.address,
            });

            setNewNote('');
            toast({ title: 'Tersimpan', description: 'Data pelanggan berhasil diperbarui.' });

            await fetchCustomerData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: (error as Error).message });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePipelineChange = async (newStatus: PipelineStatus) => {
        if (!customer || !userProfile) return;

        const originalStatus = customer.pipelineStatus;
        setCustomer(prev => prev ? { ...prev, pipelineStatus: newStatus } : null);

        try {
            await updatePipelineStatus({
                customerId,
                customerName: customer.name,
                newStatus,
                actorId: userProfile.uid,
                actorName: userProfile.name,
            });
            toast({ title: 'Status diperbarui', description: `Status menjadi ${newStatus}.` });
        } catch (err) {
            setCustomer(prev => prev ? { ...prev, pipelineStatus: originalStatus } : null);
            toast({ variant: 'destructive', title: 'Gagal update status', description: (err as Error).message });
        }
    };

    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Tersalin!', description: 'Pesan telah disalin ke clipboard.' });
    }


    // --- TIMELINE LOGIC (Memoized) ---

    const manualTimelineItems = useMemo((): TimelineItem[] => {
        if (!customer?.notes) return [];
        const items: TimelineItem[] = [];

        const safeParseDate = (dateStr: string | undefined): Date => {
            if (!dateStr) return new Date();
            const parsed = parseISO(dateStr);
            return isValid(parsed) ? parsed : new Date();
        };

        customer.notes.webinar?.forEach(note => {
            items.push({
                type: 'Webinar',
                icon: Briefcase,
                title: 'Aktivitas Webinar',
                content: note.text,
                date: safeParseDate(note.createdAt),
            });
        });

        if (customer.notes.manual) {
            const rawText = customer.notes.manual;
            const entries = rawText.split(/(\[.*?\]\n)/).filter(part => part.trim() !== '');

            for (let i = 0; i < entries.length; i += 2) {
                const timestampPart = entries[i] || '';
                const contentPart = entries[i + 1] || '';

                let dateObj = new Date();
                const dateStringMatch = timestampPart.match(/\[(.*?)\]/);
                if (dateStringMatch && dateStringMatch[1]) {
                    try {
                        const parsedTimestamp = new Date(dateStringMatch[1].replace(' @ ', ' '));
                        if (isValid(parsedTimestamp)) {
                            dateObj = parsedTimestamp;
                        }
                    } catch (e) { }
                }

                if (contentPart.trim()) {
                    items.push({
                        type: 'Manual',
                        icon: ScrollText,
                        title: 'Catatan Manual',
                        content: contentPart.trim(),
                        date: dateObj,
                    });
                }
            }

            if (items.filter(i => i.type === 'Manual').length === 0 && rawText.trim().length > 0) {
                items.push({
                    type: 'Manual',
                    icon: ScrollText,
                    title: 'Catatan Manual (Lama)',
                    content: rawText.trim(),
                    date: new Date(customer.updatedAt),
                });
            }
        }

        return items.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [customer?.notes, customer?.updatedAt]);

    const generationHistory = useMemo(() => {
        if (!customer?.generationHistory) return [];
        return [...customer.generationHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [customer?.generationHistory]);

    const replyAssistantHistory = useMemo(() => {
        return generationHistory.filter(item => item.generationSource === 'Reply Assistant');
    }, [generationHistory]);

    const hasFormData = useMemo(() => customer && customer.formAnswers && customer.formAnswers.length > 0, [customer]);

    const aiAssistantHistory = useMemo(() => {
        return generationHistory.filter(item => item.generationSource === 'AI Assistant' || !item.generationSource);
    }, [generationHistory]);

    const aiAssistantWhatsapp = useMemo(() => aiAssistantHistory.filter(item => item.type === 'whatsapp'), [aiAssistantHistory]);
    const aiAssistantEmail = useMemo(() => aiAssistantHistory.filter(item => item.type === 'email'), [aiAssistantHistory]);


    // --- RENDER ---

    const HistoryCard = ({ item }: { item: GenerationHistoryItem }) => (
        <Card className="bg-muted/50">
            <CardHeader className="p-4">
                <div className="flex justify-between items-start text-xs text-muted-foreground mb-2">
                    <div className='flex items-center gap-1.5'>
                        {item.type === 'whatsapp' ? <Smartphone className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                        <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: localeId })}</span>
                    </div>
                </div>
                <p className="text-sm font-semibold text-foreground">{item.conversationContext}</p>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
                {item.recommendations.map((rec, recIndex) => (
                    <div key={recIndex} className="text-sm flex items-start gap-2 text-foreground p-3 border-l-2 border-primary/50 bg-background rounded-r-md">
                        <div className="flex-1 whitespace-pre-wrap">{rec}</div>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleCopyToClipboard(rec)}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );

    const GenerationHistoryTabContent = ({ items }: { items: GenerationHistoryItem[] }) => {
        if (items.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                    <MessageSquare className="h-10 w-10 mb-2 opacity-20" />
                    <p>Belum ada riwayat.</p>
                </div>
            )
        }
        return (
            <div className="space-y-4">
                {items.map((item, index) => <HistoryCard key={index} item={item} />)}
            </div>
        )
    };

    const tabOptions = [
        { value: 'timeline', label: 'Timeline Aktivitas' },
        ...(hasFormData ? [{ value: 'form-data', label: 'Data Form' }] : []),
        { value: 'reply-assistant', label: 'Riwayat Reply Assistant' },
        { value: 'ai-assistant', label: 'Riwayat AI Assistant' },
    ];


    if (isLoading) {
        return (
            <div className="p-4 md:p-8 space-y-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-8 w-64" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <Skeleton className="h-96 w-full" />
                        <Skeleton className="h-56 w-full" />
                    </div>
                    <div className="lg:col-span-2 space-y-6">
                        <Skeleton className="h-96 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (!customer) {
        return <div className="p-8 text-center">Pelanggan tidak ditemukan.</div>;
    }

    return (
        <form onSubmit={form.handleSubmit(handleSaveChanges)}>
            <EmailClientDialog
                isOpen={emailClientState.isOpen}
                onOpenChange={(isOpen) => setEmailClientState({ isOpen, email: '' })}
                email={emailClientState.email}
            />
            <div className="p-4 md:p-8 space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Button type="button" variant="outline" size="icon" asChild>
                            <Link href={`/dashboard?view=${userProfile?.role === 'Leader' ? 'customer-manager' : 'my-customers'}`}>
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">{customer.name}</h1>
                            <p className="text-muted-foreground text-sm">Detail kontak dan riwayat aktivitas.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Button type="submit" disabled={isSaving} className="w-full md:w-auto">
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Simpan Perubahan
                        </Button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* Left Column: Customer Info & Products */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Card Info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Tentang Pelanggan</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm">
                                <div className="space-y-1">
                                    <Label htmlFor="name">Nama Lengkap <span className="text-destructive">*</span></Label>
                                    <Input id="name" {...form.register('name')} />
                                    {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="company">Perusahaan</Label>
                                    <Input id="company" {...form.register('company')} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="jobTitle">Jabatan</Label>
                                    <Input id="jobTitle" {...form.register('jobTitle')} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="address">Alamat</Label>
                                    <Input id="address" {...form.register('address')} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Sumber</Label>
                                    <div className="flex items-center gap-2">
                                        <Link2 className="h-4 w-4 text-muted-foreground" />
                                        <Badge variant="outline">{customer.acquisitionContext?.source || 'Manual'}</Badge>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="email">Email</Label>
                                    <div className="flex items-center gap-2">
                                        <Input id="email" type="email" {...form.register('email')} className="flex-1" />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 shrink-0"
                                            onClick={() => setEmailClientState({ isOpen: true, email: watchedEmail || '' })}
                                            disabled={!watchedEmail}
                                        >
                                            <Mail className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {form.formState.errors.email && <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>}
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="phone">Telepon</Label>
                                    <div className="flex items-center gap-2">
                                        <Input id="phone" {...form.register('phone')} className="flex-1" />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 shrink-0"
                                            asChild
                                            disabled={!watchedPhone}
                                        >
                                            <a href={formatWaLink(watchedPhone)} target="_blank" rel="noopener noreferrer">
                                                <Phone className="h-4 w-4" />
                                            </a>
                                        </Button>
                                    </div>
                                </div>
                                <Separator />
                                <div className="space-y-2">
                                    <Label>Status Pipeline</Label>
                                    <Select value={customer.pipelineStatus} onValueChange={(value) => handlePipelineChange(value as PipelineStatus)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Pilih status..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PIPELINE_STAGES.map(stage => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="potentialRevenue">Potensi Pendapatan (Rp)</Label>
                                    <Input
                                        id="potentialRevenue"
                                        placeholder="0"
                                        type="number"
                                        {...form.register('potentialRevenue')}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Card Products */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-lg">Produk Dimiliki</CardTitle>
                                <Button type="button" size="sm" variant="ghost" onClick={() => appendProduct({ name: PRODUCT_LIST[0], purchaseDate: new Date(), version: '', quantity: 1 })}>
                                    <PlusCircle className="h-4 w-4 text-primary" />
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                                {productFields.length > 0 ? productFields.map((field, index) => (
                                    <div key={field.id} className="p-3 border rounded-md space-y-3 relative bg-muted/10">
                                        <div className="grid grid-cols-1 gap-2">
                                            <div>
                                                <Label className="text-[10px] uppercase text-muted-foreground font-bold">Produk</Label>
                                                <Controller
                                                    name={`products.${index}.name`}
                                                    control={form.control}
                                                    render={({ field: controllerField }) => (
                                                        <Select onValueChange={controllerField.onChange} value={controllerField.value}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="Pilih..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {PRODUCT_LIST.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-[10px] uppercase text-muted-foreground font-bold">Tgl. Beli</Label>
                                                <Controller
                                                    name={`products.${index}.purchaseDate`}
                                                    control={form.control}
                                                    render={({ field: controllerField }) => (
                                                        <DatePicker
                                                            date={controllerField.value}
                                                            setDate={controllerField.onChange}
                                                            className="h-8 text-xs w-full"
                                                        />
                                                    )}
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[10px] uppercase text-muted-foreground font-bold">Versi</Label>
                                                <Input {...form.register(`products.${index}.version`)} className="h-8 text-xs" placeholder="Contoh: 2024" />
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute -top-2 -right-2 h-6 w-6 bg-background border shadow-sm rounded-full hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => removeProduct(index)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                )) : <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-md">Belum ada produk.</p>}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Activity History */}
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Catatan Cepat</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Textarea
                                    placeholder="Tulis catatan hasil meeting, call, atau update progress di sini..."
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    rows={3}
                                    className="resize-none"
                                />
                                <p className="text-xs text-muted-foreground">
                                    *Catatan ini akan ditambahkan ke Timeline Aktivitas setelah Anda menekan tombol "Simpan Perubahan".
                                </p>
                            </CardContent>
                        </Card>

                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <div className="md:hidden">
                                <Select value={activeTab} onValueChange={setActiveTab}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Pilih Tampilan" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {tabOptions.map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="hidden md:block">
                                <TabsList className={cn("grid w-full", hasFormData ? "grid-cols-4" : "grid-cols-3")}>
                                    {tabOptions.map(option => (
                                        <TabsTrigger key={option.value} value={option.value}>
                                            {option.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </div>

                            <TabsContent value="timeline" className="mt-4">
                                {manualTimelineItems.length > 0 ? (
                                    <div className="relative pl-6 border-l-2 border-muted ml-2 space-y-8 py-2">
                                        {manualTimelineItems.map((item, index) => (
                                            <div key={index} className="relative group">
                                                <div className="absolute -left-[31px] top-1 w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center z-10">
                                                    <item.icon className="h-4 w-4 text-primary" />
                                                </div>
                                                <div className="bg-card border rounded-lg p-4 shadow-sm group-hover:shadow-md transition-all">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-semibold text-sm">{item.title}</h4>
                                                        <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                                                            {isValid(item.date) ? format(item.date, "d MMM yy, HH:mm", { locale: localeId }) : '-'}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                                        {item.content}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                                        <ScrollText className="h-10 w-10 mb-2 opacity-20" />
                                        <p>Belum ada aktivitas manual tercatat.</p>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="form-data" className="mt-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2"><ClipboardList /> Jawaban Form (Hasil OCR)</CardTitle>
                                        <CardDescription>
                                            Data yang diekstrak dari formulir yang dipindai. Anda dapat mengedit atau menambahkan data baru di sini.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {formAnswerFields.length > 0 ? (
                                            formAnswerFields.map((field, index) => (
                                                <div key={field.id} className="space-y-1">
                                                    <Label htmlFor={`form-q-${index}`} className="text-muted-foreground">{`${index + 1}. ${field.question}`}</Label>
                                                    <Input
                                                        id={`form-q-${index}`}
                                                        {...form.register(`formAnswers.${index}.answer`)}
                                                    />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                                                <ClipboardList className="h-8 w-8 mb-2 opacity-30" />
                                                <p>Belum ada data form untuk pelanggan ini.</p>
                                                <p className="text-xs mt-1">
                                                    Data form biasanya muncul jika pelanggan diinput dari form OCR.
                                                </p>
                                            </div>
                                        )}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => appendFormAnswer({ question: 'Pertanyaan Baru', answer: '' })}
                                            className="mt-4"
                                        >
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Tambah Data Form
                                        </Button>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="reply-assistant" className="mt-4">
                                <GenerationHistoryTabContent items={replyAssistantHistory} />
                            </TabsContent>

                            <TabsContent value="ai-assistant" className="mt-4">
                                <Tabs defaultValue="whatsapp-ai">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="whatsapp-ai">WhatsApp</TabsTrigger>
                                        <TabsTrigger value="email-ai">Email</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="whatsapp-ai" className="mt-4">
                                        <GenerationHistoryTabContent items={aiAssistantWhatsapp} />
                                    </TabsContent>
                                    <TabsContent value="email-ai" className="mt-4">
                                        <GenerationHistoryTabContent items={aiAssistantEmail} />
                                    </TabsContent>
                                </Tabs>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </form>
    );
}
