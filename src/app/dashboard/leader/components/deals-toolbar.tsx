'use client';
import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Download, Trash2, Users, Search, X, Filter } from "lucide-react";
import { useDashboard } from "../context/dashboard-context";
import { useDebounce } from 'use-debounce';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DateRange } from 'react-day-picker';


interface DealsToolbarProps {
    selectedCount: number;
    onDownload: () => void;
    onBulkDelete: () => void;
    onBulkAssign: (newSalesId: string) => void;
}

export function DealsToolbar({ selectedCount, onDownload, onBulkDelete, onBulkAssign }: DealsToolbarProps) {
    const { salesTeam, openCustomerEditDialog, dealsFilters, setDealsFilters } = useDashboard();
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearch] = useDebounce(searchValue, 300);

    useEffect(() => {
        setDealsFilters(prev => ({ ...prev, search: debouncedSearch }));
    }, [debouncedSearch, setDealsFilters]);
    
    const handleSalesFilterChange = (salesId: string) => {
        setDealsFilters(prev => ({ ...prev, salesId }));
    };

    const handleDateFilterChange = (dateRange: DateRange | undefined) => {
        setDealsFilters(prev => ({ ...prev, dateRange: dateRange || null }));
    };

    const isFiltered = dealsFilters.salesId !== 'all' || !!dealsFilters.dateRange;

    const clearFilters = () => {
        setDealsFilters({ search: '', salesId: 'all', dateRange: null });
        setSearchValue('');
    }

    return (
        <div className="space-y-4 mb-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="relative">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input 
                            placeholder="Cari berdasarkan nama deal..." 
                            className="w-64 pl-9"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                         />
                    </div>
                    
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="relative">
                                <Filter className="h-4 w-4" />
                                <span className="sr-only">Filter</span>
                                {isFiltered && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-auto p-4 space-y-4" align="start">
                             <div>
                                 <p className="text-sm font-medium mb-2">Filter Berdasarkan Sales</p>
                                <Select onValueChange={handleSalesFilterChange} value={dealsFilters.salesId}>
                                    <SelectTrigger className="w-[280px]">
                                        <SelectValue placeholder="Semua Sales" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Semua Sales</SelectItem>
                                        <SelectItem value="unassigned">Belum Ditugaskan</SelectItem>
                                        {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <p className="text-sm font-medium mb-2">Filter Berdasarkan Tanggal</p>
                                <DateRangePicker 
                                    range={dealsFilters.dateRange || undefined}
                                    onRangeChange={handleDateFilterChange}
                                />
                            </div>

                            {isFiltered && (
                                <>
                                    <DropdownMenuSeparator />
                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                                        <X className="mr-2 h-4 w-4" />
                                        Hapus Semua Filter
                                    </Button>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                </div>

                <div className="flex items-center gap-2">
                    {selectedCount > 0 ? (
                        <>
                            <span className="text-sm font-medium text-muted-foreground">{selectedCount} dipilih</span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline">
                                        <Users className="mr-2 h-4 w-4" />
                                        Aksi Massal
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Tugaskan ke Sales Lain</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                     {salesTeam.map(s => (
                                        <DropdownMenuItem key={s.id} onSelect={() => onBulkAssign(s.id)}>
                                            {s.name}
                                        </DropdownMenuItem>
                                     ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Hapus
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Anda Yakin?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Tindakan ini akan menghapus {selectedCount} deal yang dipilih secara permanen.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={onBulkDelete}>Ya, Hapus</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </>
                    ) : (
                         <>
                            <Button variant="outline" onClick={onDownload}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                            </Button>
                            <Button onClick={() => openCustomerEditDialog(null)}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Tambah Deal
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
