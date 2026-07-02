import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PlusCircle, Download, Trash2, Users, Search, X, Filter, UserCheck, Loader2 } from "lucide-react";
import { useDashboard } from "../leader/context/dashboard-context";
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DateRange } from 'react-day-picker';


interface SalesDealsToolbarProps {
    selectedCards: string[]; // Changed from count to array
    onDownload: () => void;
    onBulkDelete: () => void;
    onBulkAssignComplete: () => void; // Callback to clear selection
}

export function SalesDealsToolbar({ selectedCards, onDownload, onBulkDelete, onBulkAssignComplete }: SalesDealsToolbarProps) {
    const { openCustomerEditDialog, dealsFilters, setDealsFilters, userProfile, salesTeam, handleBulkAssign } = useDashboard();
    const [searchValue, setSearchValue] = useState('');
    const [debouncedSearch] = useDebounce(searchValue, 300);

    // Bulk Assign State
    const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
    const [selectedSalesId, setSelectedSalesId] = useState<string>('');
    const [isAssigning, setIsAssigning] = useState(false);

    useEffect(() => {
        setDealsFilters(prev => ({ ...prev, search: debouncedSearch }));
    }, [debouncedSearch, setDealsFilters]);

    const handleDateFilterChange = (dateRange: DateRange | undefined) => {
        setDealsFilters(prev => ({ ...prev, dateRange: dateRange || null }));
    };

    const isFiltered = !!dealsFilters.dateRange;
    const isLeader = userProfile?.role === 'Leader' || userProfile?.role === 'Superadmin';
    const selectedCount = selectedCards.length;

    const clearFilters = () => {
        setDealsFilters({ search: '', salesId: 'all', dateRange: null });
        setSearchValue('');
    }

    const executeBulkAssign = async () => {
        if (!selectedSalesId || selectedCards.length === 0) return;

        setIsAssigning(true);
        try {
            await handleBulkAssign(selectedCards, selectedSalesId);
            setIsAssignDialogOpen(false);
            onBulkAssignComplete(); // Clear selection
            setSelectedSalesId('');
        } catch (error) {
            console.error("Assign failed", error);
        } finally {
            setIsAssigning(false);
        }
    };

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
                                <span className="sr-only">Filter Tanggal</span>
                                {isFiltered && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-auto p-4 space-y-4" align="start">
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
                                        Hapus Filter
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

                            {/* Bulk Assign Button - Only for Leaders */}
                            {isLeader && (
                                <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="secondary">
                                            <UserCheck className="mr-2 h-4 w-4" />
                                            Tugaskan Sales
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Tugaskan ke Sales</DialogTitle>
                                            <DialogDescription>
                                                Pilih sales representative untuk menugaskan {selectedCount} deal yang dipilih.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="py-4 space-y-4">
                                            <div className="space-y-2">
                                                <Label>Pilih Sales</Label>
                                                <Select value={selectedSalesId} onValueChange={setSelectedSalesId}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Pilih anggota tim..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {salesTeam.map((sales) => (
                                                            <SelectItem key={sales.id} value={sales.id}>
                                                                {sales.name} ({sales.email})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Batal</Button>
                                            <Button onClick={executeBulkAssign} disabled={!selectedSalesId || isAssigning}>
                                                {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Simpan Penugasan
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}

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
