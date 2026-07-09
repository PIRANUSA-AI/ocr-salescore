
'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Eye, Sparkles, PlusCircle, ScanLine, Edit, Trash2, Mail, Phone, ShieldAlert, Users, UserPlus, Send, MoreVertical, UserCheck } from 'lucide-react';
import { type Customer, type UserProfile, GenerationHistoryItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CommunicationGenerator } from './communication-generator';
import { useAuth } from '@/hooks/use-auth';
import { useDashboard } from '../../dashboard-context';
import { OcrImportDialog } from '../../_components/leader/ocr-import-dialog';
import { ExcelPreviewDialog } from '../../_components/leader/excel-preview-dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { deleteCustomer } from '@/app/actions/leader';
// import { EmailBlastDialog } from '../../_components/leader/email-blast-dialog'; // Removed
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { EmailClientDialog } from '../../_components/email-client-dialog';
import { FadeIn } from '@/components/ui/fade-in';



const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value);
};

const getPriority = (customer: Customer): { level: 'High' | 'Medium' | 'Low' | null, variant: 'destructive' | 'default' | 'secondary' } => {
    const priorityAnswer = customer.formAnswers?.find(
        (qa) => qa.question.toLowerCase().includes('prioritas')
    )?.answer?.toLowerCase();

    switch (priorityAnswer) {
        case 'high':
            return { level: 'High', variant: 'destructive' };
        case 'medium':
            return { level: 'Medium', variant: 'default' };
        case 'low':
            return { level: 'Low', variant: 'secondary' };
        default:
            return { level: null, variant: 'secondary' };
    }
};

const formatWaLink = (phone: string | undefined | null): string => {
    if (!phone) return '#';
    let cleanedPhone = phone.replace(/[^0-9]/g, '');
    if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '62' + cleanedPhone.substring(1);
    }
    return `https://wa.me/${cleanedPhone}`;
}

const getValidPhoneNumbers = (phone: string | undefined | null): { original: string, number: string; isValid: boolean }[] => {
    if (!phone) return [];

    const parts = phone.split(/[,/\n;&]+/);

    const results = parts.map(part => {
        let cleaned = part.replace(/[^0-9+]/g, '');

        if (cleaned.startsWith('+')) {
            cleaned = cleaned.substring(1);
        }

        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }
        else if (cleaned.startsWith('8') && cleaned.length >= 9 && cleaned.length <= 13 && !cleaned.startsWith('62')) {
            cleaned = '62' + cleaned;
        }

        if (!cleaned.startsWith('62')) {
            cleaned = '62' + cleaned;
        }

        const formattedNumber = `+${cleaned}`;
        const isValidWa = formattedNumber.startsWith('+628') && formattedNumber.length >= 12 && formattedNumber.length <= 16;

        return {
            original: part.trim(),
            number: formattedNumber,
            isValid: isValidWa
        };
    });

    return results.filter(r => r.number.length > 5);
};


export const MyCustomersView = () => {
    const { userProfile } = useAuth();
    const router = useRouter();
    const isMobile = useMediaQuery("(max-width: 768px)");
    const { toast } = useToast();
    const {
        customers: initialCustomers,
        isLoading,
        refreshAllData,
        openCustomerEditDialog
    } = useDashboard();

    const [customers, setCustomers] = useState<Customer[]>(initialCustomers);

    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [navigatingToId, setNavigatingToId] = useState<string | null>(null);
    const [selectedCustomerForAI, setSelectedCustomerForAI] = useState<Customer | null>(null);
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [isDeletingCustomerId, setIsDeletingCustomerId] = useState<string | null>(null);
    const [emailClientState, setEmailClientState] = useState({ isOpen: false, email: '' });

    const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    // const [isBlastEmailOpen, setIsBlastEmailOpen] = useState(false); // Removed

    // Bulk Assign State
    const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
    const [selectedSalesId, setSelectedSalesId] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    const { salesTeam, handleBulkAssign } = useDashboard();

    const executeBulkAssign = async () => {
        if (!selectedSalesId || selectedCustomers.length === 0) return;

        setIsAssigning(true);
        try {
            await handleBulkAssign(selectedCustomers, selectedSalesId);
            setIsAssignDialogOpen(false);
            setSelectedCustomers([]); // Clear selection
            setSelectedSalesId('');
        } catch (error) {
            console.error("Assign failed", error);
        } finally {
            setIsAssigning(false);
        }
    };

    useEffect(() => {
        setCustomers(initialCustomers);
    }, [initialCustomers]);

    useEffect(() => {
        if (!isLoading && customers.length > 0 && !selectedCustomerForAI) {
            setSelectedCustomerForAI(customers[0]);
        }
        if (selectedCustomerForAI && !customers.find(c => c.id === selectedCustomerForAI.id)) {
            setSelectedCustomerForAI(customers.length > 0 ? customers[0] : null);
        }
    }, [customers, isLoading, selectedCustomerForAI]);

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c =>
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [customers, searchTerm]);

    const paginatedCustomers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredCustomers.slice(startIndex, endIndex);
    }, [filteredCustomers, currentPage, itemsPerPage]);

    const pageCount = Math.ceil(filteredCustomers.length / itemsPerPage);


    const handleNavigateToDetail = (customerId: string) => {
        setNavigatingToId(customerId);
        router.push(`/dashboard/customer/${customerId}`);
    };

    const handleCustomerSelectForAI = (customer: Customer) => {
        setSelectedCustomerForAI(customer);
    };

    const handleHookGenerated = (customerId: string, newHistoryItem: GenerationHistoryItem) => {
        const updateCustomerState = (prevCustomers: Customer[]) =>
            prevCustomers.map(c => {
                if (c.id === customerId) {
                    const updatedHistory = [...(c.generationHistory || []), newHistoryItem];
                    return { ...c, generationHistory: updatedHistory };
                }
                return c;
            });

        setCustomers(updateCustomerState);

        if (selectedCustomerForAI?.id === customerId) {
            setSelectedCustomerForAI(prev => prev ? updateCustomerState([prev])[0] : null);
        }
    };


    const handleDeleteCustomer = async (customerId: string, customerName: string) => {
        setIsDeletingCustomerId(customerId);
        try {
            await deleteCustomer(customerId);
            toast({ title: 'Sukses', description: `Pelanggan "${customerName}" berhasil dihapus.` });
            setCustomers(prev => prev.filter(c => c.id !== customerId));
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal Menghapus Pelanggan', description: (error as Error).message });
        } finally {
            setIsDeletingCustomerId(null);
        }
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedCustomers(paginatedCustomers.map(c => c.id));
        } else {
            setSelectedCustomers([]);
        }
    };

    const handleSelectRow = (customerId: string, checked: boolean) => {
        if (checked) {
            setSelectedCustomers(prev => [...prev, customerId]);
        } else {
            setSelectedCustomers(prev => prev.filter(id => id !== customerId));
        }
    };

    const handleEmailClick = (e: React.MouseEvent, email: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (email) {
            setEmailClientState({ isOpen: true, email: email });
        }
    };

    const selectedCustomerEmails = useMemo(() => {
        return customers.filter(c => selectedCustomers.includes(c.id)).map(c => c.email).filter(Boolean);
    }, [customers, selectedCustomers]);


    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="h-96 flex items-center justify-center border rounded-lg"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                <div className="h-96 flex items-center justify-center border rounded-lg"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            </div>
        )
    }

    if (!customers || customers.length === 0) {
        return (
            <div className="space-y-4">
                <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
                <div className="border rounded-lg p-12 text-center">
                    <p className='text-sm text-muted-foreground'>Anda belum memiliki pelanggan yang ditugaskan.</p>
                </div>
            </div>
        );
    }

    return (
        <FadeIn className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
            <OcrImportDialog
                isOpen={isOcrDialogOpen}
                onOpenChange={setIsOcrDialogOpen}
                onCustomerAdded={refreshAllData}
            />
            <ExcelPreviewDialog
                isOpen={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                data={previewData}
                onImportSuccess={refreshAllData}
            />
            <EmailClientDialog
                isOpen={emailClientState.isOpen}
                onOpenChange={(isOpen) => setEmailClientState({ isOpen, email: '' })}
                email={emailClientState.email}
            />
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
                    <p className="text-sm text-muted-foreground">Kelola pelanggan yang ditugaskan kepada Anda.</p>
                </div>
                <div className='flex flex-wrap items-center gap-2 flex-shrink-0'>
                    {selectedCustomers.length > 0 ? (
                        <>
                            <span className="text-sm font-medium text-muted-foreground">{selectedCustomers.length} dipilih</span>
                            {userProfile && (
                                <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="secondary" size="default">
                                            <UserCheck className="mr-2 h-4 w-4" />
                                            Tugaskan Sales
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Tugaskan Sales Massal</DialogTitle>
                                            <DialogDescription>
                                                Pilih sales untuk ditugaskan ke {selectedCustomers.length} deal yang dipilih.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="py-4">
                                            <Select value={selectedSalesId} onValueChange={setSelectedSalesId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih Sales..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {salesTeam.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Batal</Button>
                                            <Button onClick={executeBulkAssign} disabled={!selectedSalesId || isAssigning}>
                                                {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                Simpan
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </>
                    ) : (
                        <div className='flex items-center gap-2'>
                            <Button type="button" variant="outline" onClick={() => setIsOcrDialogOpen(true)} size="default">
                                <ScanLine className="mr-2 h-4 w-4" />
                                OCR
                            </Button>
                            <Button type="button" onClick={() => openCustomerEditDialog(null)} size="default">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Tambah
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className='relative'>
                <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                <Input
                    placeholder='Cari pelanggan atau perusahaan...'
                    className='w-full pl-9'
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                    }}
                />
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-3">
                {isLoading ? (
                    <div className="text-center text-muted-foreground p-4"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
                ) : paginatedCustomers.length > 0 ? (
                    paginatedCustomers.map(customer => {
                        const priority = getPriority(customer);
                        return (
                            <div
                                key={customer.id}
                                onClick={() => handleCustomerSelectForAI(customer)}
                                className={cn("p-4 border rounded-lg space-y-3 cursor-pointer", selectedCustomerForAI?.id === customer.id && 'ring-2 ring-primary border-primary')}
                            >
                                                <div className="flex justify-between items-start">
                                                    <div className='flex items-start gap-3'>
                                                        <Checkbox
                                                            className='mt-1'
                                                            onClick={(e) => e.stopPropagation()}
                                                            checked={selectedCustomers.includes(customer.id)}
                                                            onCheckedChange={(checked) => handleSelectRow(customer.id, !!checked)}
                                                        />
                                                        <div>
                                                            <div className="font-semibold text-foreground">{customer.name}</div>
                                                            <div className="text-xs text-muted-foreground">{customer.company || '-'}</div>
                                                        </div>
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleNavigateToDetail(customer.id)}>
                                                                <Eye className="mr-2 h-4 w-4" /> Lihat Detail
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => openCustomerEditDialog(customer)}>
                                                                <Edit className="mr-2 h-4 w-4" /> Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                        <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                                                    </DropdownMenuItem>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
                                                                        <AlertDialogDescription>Tindakan ini akan menghapus "{customer.name}" secara permanen.</AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleDeleteCustomer(customer.id, customer.name)}>Ya, Hapus</AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                                <div className="space-y-1 text-sm pl-8">
                                                    {priority.level && (
                                                        <Badge variant={priority.variant}>
                                                            <ShieldAlert className="mr-1.5 h-3 w-3" />
                                                            Prioritas: {priority.level}
                                                        </Badge>
                                                    )}
                                                    <button onClick={(e) => handleEmailClick(e, customer.email)} className="flex items-center gap-2 text-primary hover:underline w-full text-left">
                                                        <Mail className='h-3.5 w-3.5' />{customer.email || '-'}
                                                    </button>
                                                    <div className="flex flex-col gap-1">
                                                        {getValidPhoneNumbers(customer.phone).length > 0 ? (
                                                            getValidPhoneNumbers(customer.phone).map((numInfo, idx) => (
                                                                numInfo.isValid ? (
                                                                    <a key={idx} href={`https://wa.me/${numInfo.number.replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline font-medium">
                                                                        <Phone className='h-3.5 w-3.5 flex-shrink-0' /><span>{numInfo.number}</span>
                                                                    </a>
                                                                ) : (
                                                                    <span key={idx} className="flex items-center gap-2 text-muted-foreground">
                                                                        <Phone className='h-3.5 w-3.5 flex-shrink-0' /><span>{numInfo.number}</span>
                                                                    </span>
                                                                )
                                                            ))
                                                        ) : (
                                                            <span className="flex items-center gap-2 text-muted-foreground">
                                                                <Phone className='h-3.5 w-3.5 flex-shrink-0' /><span>-</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-muted-foreground pt-1">
                                                        <Badge variant="secondary">{customer.pipelineStatus}</Badge>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                ) : (
                                    <div className="text-center text-muted-foreground h-24 flex items-center justify-center">Belum ada pelanggan yang ditugaskan.</div>
                                )}
                            </div>
                            {/* Desktop View */}
                            <div className="hidden md:block border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">
                                                <Checkbox
                                                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                                    checked={selectedCustomers.length === paginatedCustomers.length && paginatedCustomers.length > 0}
                                                    indeterminate={selectedCustomers.length > 0 && selectedCustomers.length < paginatedCustomers.length}
                                                />
                                            </TableHead>
                                            <TableHead>Pelanggan</TableHead>
                                            <TableHead>Prioritas</TableHead>
                                            <TableHead>Info Kontak</TableHead>
                                            <TableHead>Status Pipeline</TableHead>
                                            <TableHead>Potensi</TableHead>
                                            <TableHead className="w-[120px]">Aksi</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedCustomers.map((customer) => {
                                            const priority = getPriority(customer);
                                            return (
                                                <TableRow
                                                    key={customer.id}
                                                    onClick={() => handleCustomerSelectForAI(customer)}
                                                    className={`cursor-pointer ${selectedCustomerForAI?.id === customer.id ? 'bg-primary/10' : ''}`}
                                                    data-state={selectedCustomers.includes(customer.id) ? "selected" : ""}
                                                >
                                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox
                                                            checked={selectedCustomers.includes(customer.id)}
                                                            onCheckedChange={(checked) => handleSelectRow(customer.id, !!checked)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-semibold text-foreground">{customer.name}</div>
                                                        <div className="text-xs text-muted-foreground">{customer.company || '-'}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {priority.level && (
                                                            <Badge variant={priority.variant}>
                                                                <ShieldAlert className="mr-1.5 h-3 w-3" />
                                                                {priority.level}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className='text-sm'>
                                                        <button onClick={(e) => handleEmailClick(e, customer.email)} className="flex items-center gap-2 text-primary hover:underline w-full text-left">
                                                            <Mail className='h-3.5 w-3.5' />{customer.email || '-'}
                                                        </button>
                                                        <div className="flex flex-col gap-1 mt-1">
                                                            {getValidPhoneNumbers(customer.phone).length > 0 ? (
                                                                getValidPhoneNumbers(customer.phone).map((numInfo, idx) => (
                                                                    numInfo.isValid ? (
                                                                        <a key={idx} href={`https://wa.me/${numInfo.number.replace('+', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-green-600 hover:text-green-700 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                                                                            <Phone className='h-3.5 w-3.5 flex-shrink-0' />
                                                                            <span>{numInfo.number}</span>
                                                                        </a>
                                                                    ) : (
                                                                        <span key={idx} className="flex items-center gap-2 text-muted-foreground">
                                                                            <Phone className='h-3.5 w-3.5 flex-shrink-0' />
                                                                            <span>{numInfo.number}</span>
                                                                        </span>
                                                                    )
                                                                ))
                                                            ) : (
                                                                <span className="flex items-center gap-2 text-muted-foreground">
                                                                    <Phone className='h-3.5 w-3.5 flex-shrink-0' />
                                                                    <span>-</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={customer.pipelineStatus === 'Won' ? 'default' : (customer.pipelineStatus === 'Lost' ? 'destructive' : 'secondary')}
                                                            className="w-fit"
                                                        >
                                                            {customer.pipelineStatus}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-semibold text-sm text-foreground">
                                                            {formatCurrency(customer.potentialRevenue)}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex gap-1">
                                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleNavigateToDetail(customer.id) }} disabled={navigatingToId === customer.id}>
                                                                {navigatingToId === customer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                                            </Button>
                                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openCustomerEditDialog(customer) }}>
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Tindakan ini akan menghapus pelanggan "{customer.name}" secara permanen.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel disabled={isDeletingCustomerId === customer.id}>Batal</AlertDialogCancel>
                                                                        <AlertDialogAction
                                                                            onClick={() => handleDeleteCustomer(customer.id, customer.name)}
                                                                            disabled={isDeletingCustomerId === customer.id}
                                                                        >
                                                                            {isDeletingCustomerId === customer.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                                            Ya, Hapus Pelanggan
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                            <DataTablePagination
                                totalItems={filteredCustomers.length}
                                itemsPerPage={itemsPerPage}
                                currentPage={currentPage}
                                onPageChange={setCurrentPage}
                                onItemsPerPageChange={(value) => {
                                    setItemsPerPage(value);
                                    setCurrentPage(1);
                                }}
                            />
            <div className="lg:col-span-1">
                {selectedCustomerForAI && userProfile ? (
                    <CommunicationGenerator
                        customer={selectedCustomerForAI}
                        salesPerson={userProfile}
                        onHookGenerated={handleHookGenerated}
                    />
                ) : (
                    <div className="border rounded-lg h-[500px] flex items-center justify-center">
                        <div className="text-center text-muted-foreground p-6">
                            <Sparkles className="mx-auto h-8 w-8" />
                            <p className="mt-3 font-semibold text-sm">Pilih Pelanggan</p>
                            <p className="text-xs mt-1">Pilih pelanggan dari tabel untuk memulai membuat pesan AI.</p>
                        </div>
                    </div>
                )}
            </div>
        </FadeIn>
    );
}
