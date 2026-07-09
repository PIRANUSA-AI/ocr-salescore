

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Loader2, UploadCloud, Image as ImageIcon, FileText, X, Bot, Send, History, Smartphone, Mail, UserCheck, Search, ChevronsUpDown, Check, ArrowLeft, PlusCircle, Copy, MessageSquare, RefreshCw, AlertTriangle } from 'lucide-react';
import {
    generateWhatsappReply,
    type GenerateWhatsappReplyInput,
    type GenerateWhatsappReplyOutput,
} from '@/ai/flows/generate-whatsapp-reply-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Customer, type UserProfile, type GenerationHistoryItem } from '@/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { api } from '@/lib/api-client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { usePathname } from 'next/navigation';


const salesAssistantSchema = z.object({
    chatHistory: z.string().optional(),
    customerName: z.string().min(1, 'Nama pelanggan tidak boleh kosong.'),
    telepon: z.string().optional(),
    jabatan: z.string().optional(),
    customerCompany: z.string().optional(),
    email: z.string().email({ message: 'Email tidak valid.' }).optional().or(z.literal('')),
    lastContactedAt: z.date().optional(),
    contextHint: z.string().optional(),
});

type SalesAssistantForm = z.infer<typeof salesAssistantSchema>;

// -- History Tab Component --
const CustomerHistory = () => {
    const [historyCustomers, setHistoryCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    const fetchHistory = useCallback(() => {
        setIsLoading(true);
        api.customers.list()
            .then(r => {
                const assistantCustomers = r.customers.filter(c =>
                    c.acquisitionContext?.source === 'Reply Assistant' && c.generationHistory && c.generationHistory.length > 0
                );
                setHistoryCustomers(assistantCustomers);
            })
            .catch(err => console.error("Failed to fetch customer history:", err))
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    if (isLoading) {
        return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    if (historyCustomers.length === 0) {
        return <p className="text-center text-sm text-muted-foreground p-8">Belum ada riwayat pelanggan yang dibuat dari asisten ini.</p>;
    }

    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Tersalin!', description: 'Rekomendasi balasan telah disalin.' });
    }

    return (
        <Accordion type="single" collapsible className="w-full">
            {historyCustomers.map(customer => (
                <AccordionItem value={customer.id} key={customer.id}>
                    <AccordionTrigger>
                        <div>
                            <p className="font-semibold text-left">{customer.name}</p>
                            <p className="text-sm text-muted-foreground text-left">{customer.company}</p>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="space-y-3 pr-2" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {customer.generationHistory!.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((item, index) => (
                                <Card key={index} className="bg-muted/50">
                                    <CardHeader className="p-3">
                                        <div className="flex justify-between items-start text-xs text-muted-foreground mb-2">
                                            <div className='flex items-center gap-1.5'>
                                                <MessageSquare className="h-3 w-3" />
                                                <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: id })}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm font-semibold text-foreground">{item.conversationContext}</p>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-2">
                                        {item.recommendations.map((rec, recIndex) => (
                                            <div key={recIndex} className="text-sm flex items-start gap-2 text-foreground p-2 border-l-2 border-primary/50 bg-background/50 rounded-r-md">
                                                <div className="flex-1 whitespace-pre-wrap">{rec}</div>
                                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleCopyToClipboard(rec)}>
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            ))
                            }
                        </div>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
};


// -- Main Sales Assistant Component --
export default function SalesAssistantPage() {
    const { user, userProfile } = useAuth();
    const pathname = usePathname(); // Using usePathname to trigger effect on URL change
    const [inputMode, setInputMode] = useState<'text' | 'image'>('text');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<GenerateWhatsappReplyOutput | null>(null);
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState('assistant');
    const [lastCustomerId, setLastCustomerId] = useState<string | null>(null);
    const [selectedExistingCustomer, setSelectedExistingCustomer] = useState<Customer | null>(null);
    const [editedRecommendations, setEditedRecommendations] = useState<Record<number, string>>({});


    const [salesTeam, setSalesTeam] = useState<UserProfile[]>([]);
    const [selectedSales, setSelectedSales] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    // State for customer search
    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
    const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);

    useEffect(() => {
        api.users.list({ role: 'Sales' }).then(r => setSalesTeam(r.users));
        api.customers.list().then(r => setAllCustomers(r.customers));
    }, []);

    const handleRecommendationChange = (index: number, value: string) => {
        setEditedRecommendations(prev => ({ ...prev, [index]: value }));
    };


    const handleSelectCustomer = (customerId: string) => {
        const customer = allCustomers.find(c => c.id === customerId);
        if (customer) {
            setSelectedExistingCustomer(customer);
            form.reset({
                customerName: customer.name,
                telepon: customer.phone,
                jabatan: customer.jobTitle,
                customerCompany: customer.company,
                email: customer.email,
                contextHint: '', // Clear hint
                chatHistory: '', // Clear history
            });
        }
        setSearchPopoverOpen(false);
    }

    const handleAddNewCustomer = () => {
        setSelectedExistingCustomer(null);
        form.reset({
            customerName: '',
            telepon: '',
            jabatan: '',
            customerCompany: '',
            email: '',
            contextHint: '',
            chatHistory: '',
        });
        setSearchPopoverOpen(false);
    }


    const form = useForm<SalesAssistantForm>({
        resolver: zodResolver(salesAssistantSchema),
        defaultValues: {
            customerName: '',
            telepon: '',
            jabatan: '',
            customerCompany: '',
            email: '',
            contextHint: '',
        },
    });

    const handleFileChange = (file: File | null) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'File Tidak Valid', description: 'File yang diunggah harus berupa gambar.' });
            return;
        }
        if (file.size > 4 * 1024 * 1024) { // 4MB limit for Gemini
            toast({ variant: 'destructive', title: 'Ukuran File Terlalu Besar', description: 'Ukuran gambar tidak boleh melebihi 4MB.' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setImageBase64(e.target?.result as string);
            setImagePreview(URL.createObjectURL(file));
            setError(null);
        };
        reader.readAsDataURL(file);
    };

    const removeImage = () => {
        setImageBase64(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    const onSubmit = async (data: SalesAssistantForm) => {
        if (!userProfile) return;
        setIsLoading(true);
        setError(null);
        setResult(null);
        setEditedRecommendations({});
        setLastCustomerId(selectedExistingCustomer?.id || null); // Use existing ID if available

        if (inputMode === 'image' && !imageBase64) {
            setError('Silakan unggah foto percakapan terlebih dahulu.');
            setIsLoading(false);
            return;
        }
        if (inputMode === 'text' && !data.chatHistory?.trim()) {
            setError('Riwayat chat tidak boleh kosong.');
            setIsLoading(false);
            return;
        }

        try {
            const input: GenerateWhatsappReplyInput = {
                ...data,
                chatHistory: inputMode === 'text' ? data.chatHistory : undefined,
                image: inputMode === 'image' ? imageBase64! : undefined,
                lastContactedAt: data.lastContactedAt?.toISOString(),
            };
            const response = await generateWhatsappReply(input);
            setResult(response);

            // --- SAVE CUSTOMER AND HISTORY TO DB ---
            // 1. Create or update customer record.
            const notesToSave = `[Dari Reply Assistant] \nKonteks: ${data.contextHint || '-'} \n\nRiwayat Chat:\n${inputMode === 'text' ? data.chatHistory : '[Pengguna mengunggah screenshot percakapan.]'}`;
            const customerPayload = {
                ...data,
                name: data.customerName,
                acquisitionContext: {
                    source: 'Reply Assistant' as const,
                    eventName: 'WhatsApp Chat Analysis',
                    eventDate: new Date()
                },
                notes: notesToSave,
                email: selectedExistingCustomer?.email || data.email, // Prioritize existing email to ensure update
                creatorTeam: userProfile.team,
            };

            const customerResult = await api.customers.createManual(customerPayload);
            if (!customerResult.success) throw new Error("Gagal menyimpan data pelanggan.");

            const customerId = customerResult.customerId;
            setLastCustomerId(customerId); // Save the customer ID
            toast({
                title: `Pelanggan ${customerResult.status === 'created' ? 'Disimpan' : 'Diperbarui'}`,
                description: `"${data.customerName}" telah ${customerResult.status === 'created' ? 'ditambahkan' : 'diperbarui'} di database.`,
            });

            // 2. Save the rich history item
            const historyItem: Omit<GenerationHistoryItem, 'createdAt'> = {
                generationSource: 'Reply Assistant',
                userInput: {
                    mode: inputMode,
                    text: inputMode === 'text' ? data.chatHistory || '' : '[Gambar diunggah]',
                    context: data.contextHint || 'Tidak ada konteks tambahan.',
                },
                conversationContext: response.conversationContext,
                recommendations: response.recommendations,
                type: 'whatsapp', // Default to whatsapp for now
            };

            await api.customers.addGenerationHistory(customerId, historyItem);

            // Refresh customer list to include new/updated one
            api.customers.list().then(r => setAllCustomers(r.customers));

        } catch (e: any) {
            setError(e.message || 'Terjadi kesalahan saat mengambil rekomendasi.');
            toast({
                variant: 'destructive',
                title: 'Proses Gagal',
                description: e.message || 'Terjadi kesalahan tidak terduga.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendToWhatsapp = (text: string) => {
        const phone = form.getValues('telepon');
        if (!phone?.trim()) {
            toast({
                variant: 'destructive',
                title: 'Nomor Telepon Kosong',
                description: "Silakan isi 'Nomor Telepon (WA)' untuk mengirim pesan."
            });
            form.setFocus('telepon');
            return;
        }

        let cleanedPhone = phone.replace(/[^0-9]/g, '');
        if (cleanedPhone.startsWith('0')) {
            cleanedPhone = '62' + cleanedPhone.substring(1);
        }

        const encodedMessage = encodeURIComponent(text);
        const waUrl = `https://wa.me/${cleanedPhone}?text=${encodedMessage}`;
        window.open(waUrl, '_blank');
    }

    const handleAssignToSales = async (message: string) => {
        const customerIdToAssign = selectedExistingCustomer?.id || lastCustomerId;
        if (!customerIdToAssign) {
            toast({ variant: 'destructive', title: 'Error', description: 'ID pelanggan tidak ditemukan untuk penugasan.' });
            return;
        }
        if (!selectedSales) {
            toast({ variant: 'destructive', title: 'Sales Belum Dipilih', description: 'Silakan pilih sales yang akan ditugaskan.' });
            return;
        }

        setIsAssigning(true);
        try {
            const salesName = salesTeam.find(s => s.uid === selectedSales)?.name || 'Unknown';
            await api.customers.assignNote(customerIdToAssign, selectedSales, salesName, message);
            toast({
                title: 'Tugas Berhasil Didelegasikan',
                description: `Pelanggan telah ditugaskan ke ${salesName} dengan catatan pesan yang relevan.`,
            });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Menugaskan', description: (error as Error).message });
        } finally {
            setIsAssigning(false);
        }
    };


    return (
        <div className="pt-6">
            <Card>
                <CardContent className="pt-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="assistant"><Bot className="mr-2 h-4 w-4" /> Rekomendasi Balasan</TabsTrigger>
                            <TabsTrigger value="history"><History className="mr-2 h-4 w-4" /> Riwayat Pelanggan</TabsTrigger>
                        </TabsList>
                        <TabsContent value="assistant" className="mt-6">
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <div>
                                    <Label>1. Pilih Jenis Input</Label>
                                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1 mt-2">
                                        <Button type="button" variant={inputMode === 'text' ? 'secondary' : 'ghost'} onClick={() => setInputMode('text')} className="h-auto py-2">
                                            <FileText className="mr-2 h-4 w-4" />
                                            Input Teks
                                        </Button>
                                        <Button type="button" variant={inputMode === 'image' ? 'secondary' : 'ghost'} onClick={() => setInputMode('image')} className="h-auto py-2">
                                            <ImageIcon className="mr-2 h-4 w-4" />
                                            Input Foto
                                        </Button>
                                    </div>
                                </div>

                                {inputMode === 'text' ? (
                                    <div>
                                        <Label htmlFor="chatHistory">2. Riwayat Chat Terakhir</Label>
                                        <Textarea
                                            id="chatHistory"
                                            rows={6}
                                            placeholder="Salin & tempel riwayat chat dari WhatsApp ke sini."
                                            {...form.register('chatHistory')}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <Label>2. Unggah Screenshot Chat</Label>
                                        {!imagePreview ? (
                                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0]); }}
                                            >
                                                <div className="space-y-1 text-center">
                                                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                                                    <div className="flex text-sm text-muted-foreground">
                                                        <Button asChild variant="link" size="sm">
                                                            <label htmlFor="imageUpload" className="cursor-pointer">
                                                                Pilih sebuah file
                                                                <input id="imageUpload" ref={fileInputRef} type="file" className="sr-only" accept="image/png, image/jpeg, image/webp" onChange={(e) => handleFileChange(e.target.files?.[0] || null)} />
                                                            </label>
                                                        </Button>
                                                        <p className="pl-1">atau tarik dan letakkan</p>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">PNG, JPG, WEBP hingga 4MB</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-2 relative w-fit mx-auto">
                                                <Image src={imagePreview} alt="Image preview" width={200} height={200} className="max-h-48 w-auto object-contain rounded-lg border p-1" />
                                                <Button type="button" variant="destructive" size="icon" className="absolute top-0 right-0 -m-2 h-6 w-6 rounded-full" onClick={removeImage}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <Label>3. Beri Konteks Tambahan</Label>

                                    <Popover open={searchPopoverOpen} onOpenChange={setSearchPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={searchPopoverOpen}
                                                className="w-full justify-between"
                                            >
                                                {selectedExistingCustomer
                                                    ? `Menggunakan data: ${selectedExistingCustomer.name}`
                                                    : "Cari pelanggan atau tambah baru"}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                            <Command>
                                                <CommandInput placeholder="Ketik nama pelanggan..." />
                                                <CommandList>
                                                    <CommandEmpty>
                                                        <div className='p-4 text-center text-sm'>
                                                            <p>Pelanggan tidak ditemukan.</p>
                                                            <Button variant="link" onClick={handleAddNewCustomer} className="mt-2">
                                                                <PlusCircle className="mr-2 h-4 w-4" />
                                                                Tambah sebagai pelanggan baru
                                                            </Button>
                                                        </div>
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                        <CommandItem onSelect={handleAddNewCustomer} className="cursor-pointer">
                                                            <PlusCircle className="mr-2 h-4 w-4" />
                                                            Tambah Pelanggan Baru
                                                        </CommandItem>
                                                        {allCustomers.map((customer) => (
                                                            <CommandItem
                                                                key={customer.id}
                                                                value={customer.name}
                                                                onSelect={() => handleSelectCustomer(customer.id)}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        selectedExistingCustomer?.id === customer.id ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                {customer.name} (${customer.company})
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>


                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-lg">
                                        <div>
                                            <Label htmlFor="customerName">Nama Pelanggan <span className="text-destructive">*</span></Label>
                                            <Input id="customerName" placeholder="Contoh: Budi" {...form.register('customerName')} />
                                            {form.formState.errors.customerName && <p className="text-sm text-destructive mt-1">{form.formState.errors.customerName.message}</p>}
                                        </div>
                                        <div>
                                            <Label htmlFor="telepon">Nomor Telepon (WA)</Label>
                                            <Input id="telepon" type="tel" placeholder="Contoh: 08123456789" {...form.register('telepon')} />
                                        </div>
                                        <div>
                                            <Label htmlFor="jabatan">Jabatan</Label>
                                            <Input id="jabatan" placeholder="Contoh: Manajer IT" {...form.register('jabatan')} />
                                        </div>
                                        <div>
                                            <Label htmlFor="customerCompany">Nama Perusahaan</Label>
                                            <Input id="customerCompany" placeholder="Contoh: PT Maju Jaya" {...form.register('customerCompany')} />
                                        </div>
                                        <div>
                                            <Label htmlFor="email">Email</Label>
                                            <Input id="email" type="email" placeholder="Contoh: budi@ptmajujaya.com" {...form.register('email')} />
                                            {form.formState.errors.email && <p className="text-sm text-destructive mt-1">{form.formState.errors.email.message}</p>}
                                        </div>
                                        <div>
                                            <Label htmlFor="lastContactedAt">Tgl. Kontak Terakhir</Label>
                                            <Controller
                                                name="lastContactedAt"
                                                control={form.control}
                                                render={({ field }) => <DatePicker date={field.value} setDate={field.onChange} />}
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <Label htmlFor="contextHint">Catatan Singkat (Opsional)</Label>
                                            <Input id="contextHint" placeholder="Contoh: Follow-up setelah kirim link trial ZWCAD" {...form.register('contextHint')} />
                                        </div>
                                    </div>
                                </div>

                                <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 animate-spin" /> : <Bot className="mr-2" />}
                                    {isLoading ? 'Menganalisis...' : '4. Dapatkan Rekomendasi Balasan'}
                                </Button>
                            </form>

                            {error && (
                                <Alert variant="destructive" className="mt-6">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Terjadi Kesalahan</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            {result && (
                                <div className="mt-8 pt-6 border-t">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-lg font-semibold">Rekomendasi Balasan</h3>
                                        <Button variant="outline" size="sm" onClick={form.handleSubmit(onSubmit)} disabled={isLoading}>
                                            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                            Generate Ulang
                                        </Button>
                                    </div>

                                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg mb-4 italic">
                                        Konteks: {result.conversationContext}
                                    </p>
                                    <div className="space-y-4">
                                        {result.recommendations.map((rec, index) => (
                                            <Card key={index}>
                                                <CardHeader>
                                                    <CardTitle className="text-base">Opsi Balasan #${index + 1}</CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    <Textarea
                                                        value={editedRecommendations[index] ?? rec}
                                                        onChange={(e) => handleRecommendationChange(index, e.target.value)}
                                                        rows={4}
                                                    />
                                                    <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => handleSendToWhatsapp(editedRecommendations[index] ?? rec)}>
                                                        <Send className="mr-2 h-4 w-4" />
                                                        Kirim ke WhatsApp
                                                    </Button>
                                                    {userProfile?.role === 'Leader' && (
                                                        <div className="border-t pt-3 space-y-2">
                                                            <Label className="text-xs">Atau tugaskan ke tim Sales</Label>
                                                            <div className="flex gap-2">
                                                                <Select onValueChange={setSelectedSales} value={selectedSales}>
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder="Pilih Sales..." />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {salesTeam.map(s => <SelectItem key={s.uid} value={s.uid}>{s.name}</SelectItem>)}
                                                                    </SelectContent>
                                                                </Select>
                                                                <Button variant="outline" onClick={() => handleAssignToSales(editedRecommendations[index] ?? rec)} disabled={isAssigning || !selectedSales}>
                                                                    {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                                                                    <span className="ml-2 hidden sm:inline">Tugaskan</span>
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="history" className="mt-6">
                            <CustomerHistory />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
