






'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, ShieldAlert, Send } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type Customer } from '@/types';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmailBlastDialog } from '../../_components/leader/email-blast-dialog';
import { FadeIn } from '@/components/ui/fade-in';
import { ExportButton } from '@/components/crm/export-button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTablePagination } from '@/components/ui/data-table-pagination';

const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
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

export const GlobalCustomerManager = () => {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const { toast } = useToast();
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
    const [isBlastEmailOpen, setIsBlastEmailOpen] = useState(false);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const isMobile = useMediaQuery("(max-width: 768px)");

    useEffect(() => {
        setIsLoading(true);
        api.customers.list().then(r => r.customers)
            .then(setCustomers)
            .catch(err => {
                toast({
                    variant: 'destructive',
                    title: 'Gagal Memuat Pelanggan',
                    description: (err as Error).message,
                });
            })
            .finally(() => setIsLoading(false));
    }, [toast]);

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        return customers.filter(c =>
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (c.assignedSalesName && c.assignedSalesName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (c.team && c.team.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [customers, searchTerm]);

    const paginatedCustomers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredCustomers.slice(startIndex, endIndex);
    }, [filteredCustomers, currentPage, itemsPerPage]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedCustomers(paginatedCustomers.map(c => c.id));
        } else {
            setSelectedCustomers([]);
        }
    };

    const handleSelectRow = (customerId: string, checked: boolean) => {
        setSelectedCustomers(prev => {
            if (checked) {
                return [...prev, customerId];
            } else {
                return prev.filter(id => id !== customerId);
            }
        });
    };

    const selectedCustomerEmails = useMemo(() => {
        return customers.filter(c => selectedCustomers.includes(c.id)).map(c => c.email).filter(Boolean);
    }, [customers, selectedCustomers]);

    return (
        <>
            <EmailBlastDialog
                isOpen={isBlastEmailOpen}
                onOpenChange={setIsBlastEmailOpen}
                recipientEmails={selectedCustomerEmails}
                recipientCount={selectedCustomers.length}
            />
            <FadeIn>
                <Card>
                    <CardHeader>
                        {/* Title row */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <CardTitle className="flex items-center gap-2">
                                    <span className="font-headline text-xl sm:text-2xl md:text-3xl font-bold truncate">Manajemen Pelanggan Global</span>
                                    {!isLoading && (
                                        <Badge variant="default">{customers.length}</Badge>
                                    )}
                                </CardTitle>
                                <CardDescription className="mt-1">Tinjau semua data pelanggan dari seluruh tim dan divisi.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <ExportButton />
                            </div>
                        </div>
                        {/* Search row */}
                        <div className="flex items-center gap-2 pt-1">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Cari pelanggan, perusahaan, atau sales..."
                                    className="w-full pl-9 h-9"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>
                        </div>
                        {/* Bulk action bar */}
                        {selectedCustomers.length > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">{selectedCustomers.length} dipilih</span>
                                <Button variant="outline" size="sm" onClick={() => setIsBlastEmailOpen(true)}>
                                    <Send className="mr-2 h-4 w-4" />
                                    Email Blast
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent>
                        {isMobile ? (
                            /* Mobile card list */
                            <div className="space-y-2">
                                {isLoading ? (
                                    [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
                                ) : paginatedCustomers.length > 0 ? (
                                    paginatedCustomers.map((c) => {
                                        const priority = getPriority(c);
                                        return (
                                            <div
                                                key={c.id}
                                                data-state={selectedCustomers.includes(c.id) ? "selected" : ""}
                                                className="p-3 border rounded-lg"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <Checkbox
                                                        className="mt-0.5 shrink-0"
                                                        checked={selectedCustomers.includes(c.id)}
                                                        onCheckedChange={(checked) => handleSelectRow(c.id, !!checked)}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="font-medium text-sm truncate">{c.name}</div>
                                                                <div className="text-xs text-muted-foreground truncate">{c.company || '-'}</div>
                                                            </div>
                                                            {priority.level && (
                                                                <Badge variant={priority.variant} className="shrink-0">
                                                                    <ShieldAlert className="mr-1.5 h-3 w-3" />
                                                                    {priority.level}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                            <Badge variant={c.pipelineStatus === 'Won' ? 'default' : (c.pipelineStatus === 'Lost' ? 'destructive' : 'secondary')}>
                                                                {c.pipelineStatus}
                                                            </Badge>
                                                            {c.team && <Badge variant="outline">{c.team}</Badge>}
                                                            {c.assignedSalesName ? (
                                                                <Badge variant="outline">{c.assignedSalesName}</Badge>
                                                            ) : (
                                                                <span className="text-[11px] text-muted-foreground">Belum Ditugaskan</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs font-medium mt-1.5">{formatCurrency(c.potentialRevenue)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center text-muted-foreground py-12 border rounded-lg text-sm">
                                        Belum ada data pelanggan.
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Desktop table */
                            <div className="border rounded-md overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">
                                                <Checkbox
                                                    onCheckedChange={handleSelectAll}
                                                    checked={paginatedCustomers.length > 0 && selectedCustomers.length === paginatedCustomers.length}
                                                    indeterminate={selectedCustomers.length > 0 && selectedCustomers.length < paginatedCustomers.length}
                                                />
                                            </TableHead>
                                            <TableHead>Pelanggan</TableHead>
                                            <TableHead>Prioritas</TableHead>
                                            <TableHead>Tim</TableHead>
                                            <TableHead>Status Pipeline</TableHead>
                                            <TableHead>Potensi Pendapatan</TableHead>
                                            <TableHead>Sales Ditugaskan</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            [...Array(6)].map((_, i) => (
                                                <TableRow key={i}>
                                                    <TableCell><Skeleton className="h-4 w-4 rounded" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : paginatedCustomers.length > 0 ? (
                                            paginatedCustomers.map((c) => {
                                                const priority = getPriority(c);
                                                return (
                                                    <TableRow key={c.id} data-state={selectedCustomers.includes(c.id) ? "selected" : ""}>
                                                        <TableCell>
                                                            <Checkbox
                                                                checked={selectedCustomers.includes(c.id)}
                                                                onCheckedChange={(checked) => handleSelectRow(c.id, !!checked)}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium">{c.name}</div>
                                                            <div className="text-xs text-muted-foreground">{c.company}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {priority.level && (
                                                                <Badge variant={priority.variant}>
                                                                    <ShieldAlert className="mr-1.5 h-3 w-3" />
                                                                    {priority.level}
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {c.team ? <Badge variant="outline">{c.team}</Badge> : <span className='text-xs text-muted-foreground'>N/A</span>}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge
                                                                variant={c.pipelineStatus === 'Won' ? 'default' : (c.pipelineStatus === 'Lost' ? 'destructive' : 'secondary')}
                                                                className="w-fit"
                                                            >
                                                                {c.pipelineStatus}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className='text-sm font-medium'>{formatCurrency(c.potentialRevenue)}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {c.assignedSalesName ? (
                                                                <Badge variant="outline">{c.assignedSalesName}</Badge>
                                                            ) : (
                                                                <span className='text-xs text-muted-foreground'>Belum Ditugaskan</span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                                                    Belum ada data pelanggan.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        <DataTablePagination
                            totalItems={filteredCustomers.length}
                            itemsPerPage={itemsPerPage}
                            currentPage={currentPage}
                            onPageChange={setCurrentPage}
                            onItemsPerPageChange={(v) => { setItemsPerPage(v); setCurrentPage(1); }}
                        />
                    </CardContent>
                </Card>
            </FadeIn>
        </>
    );
};
