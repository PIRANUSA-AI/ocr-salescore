






'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ShieldAlert, Users, UserPlus, Send } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type Customer } from '@/types';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getAllCustomers } from '@/app/actions/leader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmailBlastDialog } from '../leader/components/email-blast-dialog';
import { FadeIn } from '@/components/ui/fade-in';
import { ExportButton } from '@/components/dashboard/export-button';

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
    const ITEMS_PER_PAGE = 20;

    useEffect(() => {
        setIsLoading(true);
        getAllCustomers()
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
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filteredCustomers.slice(startIndex, endIndex);
    }, [filteredCustomers, currentPage]);

    const pageCount = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);

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
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <span className="font-headline text-3xl font-bold">Manajemen Pelanggan Global</span>
                                {!isLoading && (
                                    <Badge variant="default">{customers.length} Customers</Badge>
                                )}
                            </CardTitle>
                            <div className='flex items-center gap-2'>
                                <ExportButton />
                                {selectedCustomers.length > 0 ? (
                                    <>
                                        <span className="text-sm font-medium text-muted-foreground">{selectedCustomers.length} dipilih</span>
                                        <Button variant="outline" onClick={() => setIsBlastEmailOpen(true)}>
                                            <Send className="mr-2 h-4 w-4" />
                                            Email Blast
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Search className='w-4 h-4 text-muted-foreground' />
                                        <Input
                                            placeholder='Cari pelanggan, perusahaan, atau sales...'
                                            className='max-w-sm'
                                            value={searchTerm}
                                            onChange={(e) => {
                                                setSearchTerm(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                        <CardDescription>Tinjau semua data pelanggan dari seluruh tim dan divisi.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-md">
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
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                                                <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                            </TableCell>
                                        </TableRow>
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
                        <div className="flex items-center justify-between pt-4">
                            <div className="text-sm text-muted-foreground">
                                Halaman {currentPage} dari {pageCount || 1}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    Sebelumnya
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, pageCount))}
                                    disabled={currentPage === pageCount}
                                >
                                    Selanjutnya
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </FadeIn>
        </>
    );
};
