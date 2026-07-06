'use client';

import React, { useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDashboard } from '@/app/dashboard/dashboard-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Users, DollarSign, Building, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { type Customer } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FadeIn } from '@/components/ui/fade-in';
import { renameCompany, deleteCompanyGroup } from '@/app/actions/customer';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { CompanyDetailSheet } from '@/components/dashboard/company-detail-sheet';
import { CompanyHoverPreview } from '@/components/dashboard/company-hover-preview';

// Define the structure for a grouped company
interface CompanyGroup {
    name: string;
    customers: Customer[];
    contactCount: number;
    totalPotentialRevenue: number;
    team: string;
    primarySales: { name: string; initials: string };
}

const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value);
};

const getInitials = (name: string) => {
    if (!name || name === 'Belum Ditugaskan') return '??';
    const names = name.split(' ');
    if (names.length > 1) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

export default function CompanyView() {
    const { customers, isLoading } = useDashboard();
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialSearch = searchParams.get('search') || '';

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const { toast } = useToast();

    // Action States
    const [editCompany, setEditCompany] = useState<{ open: boolean, oldName: string, newName: string } | null>(null);
    const [deleteCompany, setDeleteCompany] = useState<string | null>(null);
    const [selectedCompanyForAnalysis, setSelectedCompanyForAnalysis] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Sync URL search param
    React.useEffect(() => {
        const query = searchParams.get('search');
        if (query !== null && query !== searchTerm) {
            setSearchTerm(query);
            setCurrentPage(1);
        }
    }, [searchParams]);

    // Handle Rename Logic
    const handleRename = async () => {
        if (!editCompany) return;
        setIsActionLoading(true);
        try {
            await renameCompany(editCompany.oldName, editCompany.newName);
            toast({ title: "Berhasil", description: `Perusahaan ${editCompany.oldName} diubah menjadi ${editCompany.newName}` });
            setEditCompany(null);
            router.refresh();
        } catch (error) {
            toast({ title: "Gagal", description: "Gagal mengubah nama perusahaan", variant: "destructive" });
        } finally {
            setIsActionLoading(false);
        }
    };

    // Handle Delete Logic
    const handleDelete = async () => {
        if (!deleteCompany) return;
        setIsActionLoading(true);
        try {
            await deleteCompanyGroup(deleteCompany);
            toast({ title: "Berhasil", description: `Perusahaan ${deleteCompany} telah dihapus (di-unlink).` });
            setDeleteCompany(null);
        } catch (error) {
            toast({ title: "Gagal", description: "Gagal menghapus perusahaan", variant: "destructive" });
        } finally {
            setIsActionLoading(false);
        }
    };

    const toggleRow = (companyName: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(companyName)) {
                newSet.delete(companyName);
            } else {
                newSet.add(companyName);
            }
            return newSet;
        });
    };

    const companyGroups = useMemo((): CompanyGroup[] => {
        if (!customers || customers.length === 0) {
            return [];
        }

        const groups: Record<string, Customer[]> = {};

        customers.forEach(customer => {
            const companyName = customer.company?.trim();
            // Group only if a company name exists
            if (companyName) {
                if (!groups[companyName]) {
                    groups[companyName] = [];
                }
                groups[companyName].push(customer);
            }
        });

        return Object.entries(groups).map(([name, groupCustomers]) => {
            const totalPotentialRevenue = groupCustomers.reduce((acc, c) => acc + (c.potentialRevenue || 0), 0);

            const teams = new Set(groupCustomers.map(c => c.team));
            const team = teams.size > 1 ? 'Multiple' : (teams.values().next().value || 'N/A');

            const salesCount: Record<string, number> = {};
            let primarySalesName = 'Belum Ditugaskan';

            groupCustomers.forEach(c => {
                if (c.assignedSalesName) {
                    salesCount[c.assignedSalesName] = (salesCount[c.assignedSalesName] || 0) + 1;
                }
            });

            if (Object.keys(salesCount).length > 0) {
                primarySalesName = Object.keys(salesCount).reduce((a, b) => salesCount[a] > salesCount[b] ? a : b);
            }

            return {
                name,
                customers: groupCustomers,
                contactCount: groupCustomers.length,
                totalPotentialRevenue,
                team,
                primarySales: {
                    name: primarySalesName,
                    initials: getInitials(primarySalesName),
                },
            };
        }).sort((a, b) => b.totalPotentialRevenue - a.totalPotentialRevenue);

    }, [customers]);

    const filteredCompanies = useMemo(() => {
        if (searchTerm === '') return companyGroups;
        const lowercasedTerm = searchTerm.toLowerCase();
        return companyGroups.filter(company =>
            company.name.toLowerCase().includes(lowercasedTerm)
        );
    }, [companyGroups, searchTerm]);

    const paginatedCompanies = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredCompanies.slice(startIndex, endIndex);
    }, [filteredCompanies, currentPage, itemsPerPage]);


    return (
        <FadeIn>
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="font-headline text-3xl font-bold w-fit">Tampilan Perusahaan</CardTitle>
                            <CardDescription>
                                Kelompokkan pelanggan berdasarkan perusahaan untuk melihat gambaran besar.
                            </CardDescription>
                        </div>
                        <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari nama perusahaan..."
                                className="w-full pl-9"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* DESKTOP TABLE VIEW */}
                    <div className="hidden md:block border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]"></TableHead>
                                    <TableHead>Nama Perusahaan</TableHead>
                                    <TableHead>Kontak Terkait</TableHead>
                                    <TableHead>Total Potensi</TableHead>
                                    <TableHead>Tim</TableHead>
                                    <TableHead>Sales Utama</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-48 text-center">
                                            <Loader2 className="mx-auto h-8 w-8 animate-spin" />
                                        </TableCell>
                                    </TableRow>
                                ) : paginatedCompanies.length > 0 ? (
                                    paginatedCompanies.map(company => {
                                        const isExpanded = expandedRows.has(company.name);
                                        return (
                                            <React.Fragment key={company.name}>
                                                <TableRow className="group text-sm cursor-pointer hover:bg-muted/50"
                                                    onClick={() => setSelectedCompanyForAnalysis(company.name)}
                                                >
                                                    <TableCell className="w-[50px]">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); toggleRow(company.name); }}>
                                                            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isExpanded && "rotate-180")} />
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-primary">
                                                        <CompanyHoverPreview
                                                            companyName={company.name}
                                                            onAnalyzeClick={() => setSelectedCompanyForAnalysis(company.name)}
                                                        >
                                                            <span className="hover:underline cursor-pointer">{company.name}</span>
                                                        </CompanyHoverPreview>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Users className="h-4 w-4 text-muted-foreground" />
                                                            {company.contactCount} Kontak
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2 font-medium">
                                                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                                                            {formatCurrency(company.totalPotentialRevenue)}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{company.team}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Avatar className="h-7 w-7 text-xs">
                                                                <AvatarFallback>{company.primarySales.initials}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="font-medium">{company.primarySales.name}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 hover:text-blue-500"
                                                                onClick={() => setEditCompany({ open: true, oldName: company.name, newName: company.name })}
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 hover:text-destructive"
                                                                onClick={() => setDeleteCompany(company.name)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {isExpanded && (
                                                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                        <TableCell colSpan={7} className="p-0">
                                                            <div className="p-4">
                                                                <div className='border rounded-md bg-background'>
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow className='bg-muted/50'>
                                                                                <TableHead>Nama Kontak</TableHead>
                                                                                <TableHead>Jabatan</TableHead>
                                                                                <TableHead>Sales</TableHead>
                                                                                <TableHead>Potensi</TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {company.customers.map(customer => (
                                                                                <TableRow key={customer.id} className="text-xs hover:bg-muted/20">
                                                                                    <TableCell className="font-medium">{customer.name}</TableCell>
                                                                                    <TableCell className="text-muted-foreground">{customer.jobTitle || '-'}</TableCell>
                                                                                    <TableCell>
                                                                                        <Badge variant="secondary">{customer.assignedSalesName || 'N/A'}</Badge>
                                                                                    </TableCell>
                                                                                    <TableCell>{formatCurrency(customer.potentialRevenue)}</TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                                            {searchTerm ? `Tidak ada perusahaan yang cocok dengan "${searchTerm}".` : 'Tidak ada data perusahaan untuk ditampilkan.'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* MOBILE CARD VIEW */}
                    <div className="md:hidden space-y-4">
                        {isLoading ? (
                            <div className="h-24 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        ) : paginatedCompanies.length > 0 ? (
                            paginatedCompanies.map(company => {
                                const isExpanded = expandedRows.has(company.name);
                                return (
                                    <Card key={company.name} className="shadow-sm">
                                        <CardContent className="p-4 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-semibold text-lg text-primary">{company.name}</div>
                                                    <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                                        <Users className="h-3.5 w-3.5" />
                                                        {company.contactCount} Kontak
                                                        <span className="text-border">|</span>
                                                        <Badge variant="outline" className="text-[10px] h-5">{company.team}</Badge>
                                                    </div>
                                                </div>
                                                <div className="flex gap-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 hover:text-blue-500"
                                                        onClick={() => setEditCompany({ open: true, oldName: company.name, newName: company.name })}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 hover:text-destructive"
                                                        onClick={() => setDeleteCompany(company.name)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between text-sm pt-2 border-t">
                                                <div className="flex items-center gap-2 font-medium">
                                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                                    {formatCurrency(company.totalPotentialRevenue)}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6 text-[10px]">
                                                        <AvatarFallback>{company.primarySales.initials}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-xs text-muted-foreground">{company.primarySales.name}</span>
                                                </div>
                                            </div>

                                            <Button variant="outline" size="sm" className="w-full text-xs mt-2" onClick={() => toggleRow(company.name)}>
                                                {isExpanded ? (
                                                    <><ChevronDown className="h-3 w-3 mr-1 rotate-180" /> Sembunyikan Detail</>
                                                ) : (
                                                    <><ChevronDown className="h-3 w-3 mr-1" /> Lihat Detail</>
                                                )}
                                            </Button>

                                            {isExpanded && (
                                                <div className="mt-2 pt-2 border-t space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                                    {company.customers.map(c => (
                                                        <div key={c.id} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                                                            <div className="font-medium">{c.name}</div>
                                                            <div className="flex flex-col gap-1 mt-1 text-xs text-muted-foreground">
                                                                <div className="flex justify-between">
                                                                    <span>{c.jobTitle || '-'}</span>
                                                                    <span className="font-semibold text-foreground">{formatCurrency(c.potentialRevenue)}</span>
                                                                </div>
                                                                <div>Sales: {c.assignedSalesName || 'N/A'}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })
                        ) : (
                            <div className="text-center p-8 text-muted-foreground border rounded-lg border-dashed">
                                {searchTerm ? `Tidak ada data cocok dengan "${searchTerm}".` : 'Belum ada data perusahaan.'}
                            </div>
                        )}
                    </div>
                    <DataTablePagination
                        totalItems={filteredCompanies.length}
                        itemsPerPage={itemsPerPage}
                        currentPage={currentPage}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={(value) => {
                            setItemsPerPage(value);
                            setCurrentPage(1);
                        }}
                    />
                </CardContent>
            </Card>

            {/* Edit Company Dialog */}
            <Dialog open={!!editCompany} onOpenChange={(open) => !open && setEditCompany(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Nama Perusahaan</DialogTitle>
                        <DialogDescription>
                            Tindakan ini akan mengubah nama perusahaan untuk <b>semua</b> pelanggan terkait.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="companyName" className="text-right">
                                Nama
                            </Label>
                            <Input
                                id="companyName"
                                value={editCompany?.newName || ''}
                                onChange={(e) => setEditCompany(prev => prev ? { ...prev, newName: e.target.value } : null)}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditCompany(null)} disabled={isActionLoading}>Batal</Button>
                        <Button onClick={handleRename} disabled={isActionLoading}>
                            {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Simpan Perubahan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Company Alert */}
            <AlertDialog open={!!deleteCompany} onOpenChange={(open) => !open && setDeleteCompany(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus Perusahaan?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tindakan ini akan menghapus nama perusahaan "{deleteCompany}" dari semua pelanggan terkait. Data pelanggan <b>tidak</b> akan dihapus, hanya kolom perusahaannya yang akan dikosongkan.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isActionLoading}>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" disabled={isActionLoading}>
                            {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Hapus
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {/* Company Intelligence Sheet */}
            <CompanyDetailSheet
                companyName={selectedCompanyForAnalysis}
                open={!!selectedCompanyForAnalysis}
                onOpenChange={(open) => !open && setSelectedCompanyForAnalysis(null)}
            />
        </FadeIn>
    );
}
