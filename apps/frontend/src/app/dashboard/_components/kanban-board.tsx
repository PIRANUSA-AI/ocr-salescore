'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import type { Customer, PipelineStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { PIPELINE_STAGES } from '@/types';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { updatePipelineStatus } from '@/app/actions/sales';
import { useAuth } from '@/hooks/use-auth';
import { useDashboard } from '../dashboard-context';
import { User, Package, ChevronDown, Loader2, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ... (Code formatCurrency dan KanbanCard tetap sama, tidak perlu diubah) ...
const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value);
};

const KanbanCard = ({ customer, index, onCardClick, onCheckChange, isSelected }: {
    customer: Customer;
    index: number;
    onCardClick: (customer: Customer) => void;
    onCheckChange: (customerId: string, checked: boolean) => void;
    isSelected: boolean;
}) => {
    return (
        <Draggable draggableId={customer.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="mb-3"
                    onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target instanceof HTMLButtonElement ||
                            target.parentElement instanceof HTMLButtonElement ||
                            target.getAttribute('role') === 'checkbox' ||
                            target.closest('a')) { // Also prevent if clicking the link
                            e.stopPropagation();
                            return;
                        }
                        onCardClick(customer)
                    }}
                >
                    <Card className={`w-full shadow-sm hover:shadow-md transition-shadow cursor-pointer bg-card ${snapshot.isDragging ? 'ring-2 ring-primary z-50' : ''} ${isSelected ? 'border-primary ring-2 ring-primary' : ''}`}>
                        <CardContent className="p-3 space-y-3">
                            <div className="flex justify-between items-start">
                                <div className='space-y-1'>
                                    <Link
                                        href={`/dashboard/customer/${customer.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-semibold text-sm leading-snug pr-6 line-clamp-2 hover:underline hover:text-primary transition-colors"
                                    >
                                        {customer.name}
                                    </Link>
                                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">{customer.company}</p>
                                </div>
                                <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => onCheckChange(customer.id, !!checked)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1"
                                />
                            </div>

                            <p className="font-semibold text-sm">{formatCurrency(customer.potentialRevenue)}</p>

                            {customer.products && customer.products.length > 0 && (
                                <div className='space-y-1.5'>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Package className="h-3 w-3" />
                                        <span>Produk ({customer.products.length}):</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {customer.products.slice(0, 2).map(p => ( // Limit badge produk agar card tidak terlalu panjang
                                            <Badge key={p.id} variant="secondary" className='font-normal text-[10px] px-1 py-0'>{p.name}</Badge>
                                        ))}
                                        {customer.products.length > 2 && <span className="text-[10px] text-muted-foreground">+{customer.products.length - 2}</span>}
                                    </div>
                                </div>
                            )}

                            <div className='pt-2 space-y-1 text-xs text-muted-foreground border-t mt-2'>
                                <div className="flex items-center gap-1.5">
                                    <User className="h-3 w-3" />
                                    <span className="truncate max-w-[150px]">{customer.assignedSalesName || 'Belum ditugaskan'}</span>
                                </div>
                                <p>Updated: {format(new Date(customer.updatedAt), "d MMM, HH:mm", { locale: id })}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </Draggable>
    );
};

export default function KanbanBoard({ customers, onCustomersChange, openCustomerEditDialog, selectedCards, setSelectedCards, itemsPerPage = 10 }: {
    customers: Customer[],
    onCustomersChange: (customers: Customer[]) => void,
    openCustomerEditDialog?: (customer: Customer) => void,
    selectedCards: string[],
    setSelectedCards: React.Dispatch<React.SetStateAction<string[]>>,
    itemsPerPage?: number,
}) {

    const { toast } = useToast();
    const { userProfile } = useAuth();
    const context = useDashboard();
    const openEditDialog = openCustomerEditDialog || context?.openCustomerEditDialog;
    const isMobile = useMediaQuery("(max-width: 768px)");

    // Mobile-specific state
    const [selectedStage, setSelectedStage] = useState<PipelineStatus>(PIPELINE_STAGES[0]);

    // 1. STATE UNTUK MENGATUR LIMIT PER KOLOM
    // Format: { "Leads Generation": 10, "Initial Quotation": 10, ... }
    const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
    const [boardData, setBoardData] = useState<Record<PipelineStatus, Customer[]>>({} as any);

    // 2. USE EFFECT UNTUK SYNC DATA & RESET LIMIT
    // Ini penting: Jika user memfilter data dari parent, board harus refresh.
    useEffect(() => {
        // Group data berdasarkan status
        const groupedData = PIPELINE_STAGES.reduce((acc, stage) => {
            // Filter customer sesuai stage, lalu sort berdasarkan update terbaru
            const stageCustomers = customers
                .filter(c => c.pipelineStatus === stage)
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

            // Ambil limit saat ini untuk stage tersebut, atau gunakan default itemsPerPage
            const limit = visibleCounts[stage] || itemsPerPage;

            // Slice data sesuai limit
            acc[stage] = stageCustomers.slice(0, limit);
            return acc;
        }, {} as Record<PipelineStatus, Customer[]>);

        setBoardData(groupedData);
    }, [customers, visibleCounts, itemsPerPage]); // Re-run jika customers, limit, atau itemsPerPage berubah


    // 3. CALCULATE TOTALS (Menggunakan useMemo agar efisien)
    const columnStats = useMemo(() => {
        return PIPELINE_STAGES.reduce((acc, stage) => {
            const allStageCustomers = customers.filter(c => c.pipelineStatus === stage);
            acc[stage] = {
                totalCount: allStageCustomers.length,
                totalValue: allStageCustomers.reduce((sum, c) => sum + (c.potentialRevenue || 0), 0)
            };
            return acc;
        }, {} as Record<PipelineStatus, { totalCount: number, totalValue: number }>);
    }, [customers]);


    const handleCheckChange = (customerId: string, checked: boolean) => {
        setSelectedCards(prev => checked ? [...prev, customerId] : prev.filter(id => id !== customerId));
    };

    // 4. FUNCTION LOAD MORE
    const handleLoadMore = (stage: PipelineStatus) => {
        setVisibleCounts(prev => ({
            ...prev,
            [stage]: (prev[stage] || itemsPerPage) + itemsPerPage // Tambah 10 (atau itemsPerPage) lagi
        }));
    };

    const handleDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination || !userProfile) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        const startColumnId = source.droppableId as PipelineStatus;
        const endColumnId = destination.droppableId as PipelineStatus;

        // Optimistic Update Logic
        const newBoardData = { ...boardData };

        // Remove from source
        const [movedCard] = newBoardData[startColumnId].splice(source.index, 1);

        // Update card internal status
        const updatedCard = { ...movedCard, pipelineStatus: endColumnId };

        // Add to destination
        newBoardData[endColumnId].splice(destination.index, 0, updatedCard);

        setBoardData(newBoardData);

        try {
            await updatePipelineStatus({
                customerId: draggableId,
                customerName: movedCard.name,
                newStatus: endColumnId,
                actorId: userProfile.uid,
                actorName: userProfile.name,
            });
            toast({ title: "Status Diperbarui", description: `Deal dipindahkan ke ${endColumnId}.` });
            context.refreshAllData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal update status.' });
            // Refresh data dari parent untuk revert jika gagal
            context.refreshAllData();
        }
    };

    // --- Mobile List View ---
    if (isMobile) {
        const mobileCustomers = boardData[selectedStage] || [];
        const stats = columnStats[selectedStage] || { totalCount: 0, totalValue: 0 };

        return (
            <div className="flex flex-col h-full w-full p-4 space-y-4">
                {/* Stage Selector */}
                <div className="flex items-center gap-3">
                    <Select value={selectedStage} onValueChange={(v) => setSelectedStage(v as PipelineStatus)}>
                        <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Pilih Stage" />
                        </SelectTrigger>
                        <SelectContent>
                            {PIPELINE_STAGES.map(stage => (
                                <SelectItem key={stage} value={stage}>
                                    {stage} ({columnStats[stage]?.totalCount || 0})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Badge variant="outline" className="shrink-0">
                        {formatCurrency(stats.totalValue)}
                    </Badge>
                </div>

                {/* Customer List */}
                <div className="flex-1 overflow-y-auto space-y-2">
                    {mobileCustomers.length > 0 ? mobileCustomers.map((customer) => (
                        <Card key={customer.id} className="cursor-pointer" onClick={() => openEditDialog && openEditDialog(customer)}>
                            <CardContent className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">{customer.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{customer.company}</p>
                                    </div>
                                    <div className="text-right shrink-0 ml-2">
                                        <p className="font-medium text-sm">{formatCurrency(customer.potentialRevenue)}</p>
                                        <p className="text-[10px] text-muted-foreground">{customer.assignedSalesName || 'Unassigned'}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-2" />
                                </div>
                            </CardContent>
                        </Card>
                    )) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            Tidak ada data di stage ini.
                        </div>
                    )}

                    {/* Load More Button for Mobile */}
                    {stats.totalCount > mobileCustomers.length && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLoadMore(selectedStage)}
                            className="w-full text-xs text-muted-foreground hover:text-primary"
                        >
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Muat ({stats.totalCount - mobileCustomers.length}) lagi
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // --- Desktop Kanban View ---
    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            <DragDropContext onDragEnd={handleDragEnd}>
                <div className="flex-1 overflow-x-auto overflow-y-hidden h-full pb-2">
                    <div className="flex h-full p-4 gap-4 min-w-max">
                        {PIPELINE_STAGES.map(stage => {
                            const columnCustomers = boardData[stage] || [];
                            const stats = columnStats[stage] || { totalCount: 0, totalValue: 0 };
                            const hasMore = stats.totalCount > columnCustomers.length; // Cek apakah masih ada data

                            return (
                                <div key={stage} className="w-72 flex flex-col max-h-full bg-muted/70 rounded-lg shadow-sm border border-border/50">
                                    {/* Header */}
                                    <div className="flex-none flex flex-col gap-1 p-3 border-b bg-muted/50 rounded-t-lg">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-sm text-foreground truncate">{stage}</h3>
                                            <Badge variant={columnCustomers.length > 0 ? "default" : "outline"} className="text-xs">
                                                {stats.totalCount}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground font-medium">
                                            {formatCurrency(stats.totalValue)}
                                        </div>
                                    </div>

                                    {/* Droppable Area */}
                                    <Droppable droppableId={stage}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                className={`flex-1 overflow-y-auto min-h-0 p-2 transition-colors scrollbar-thin 
                                                    ${snapshot.isDraggingOver ? 'bg-primary/5' : ''}`}
                                            >
                                                {columnCustomers.map((customer, index) => (
                                                    <KanbanCard
                                                        key={customer.id}
                                                        customer={customer}
                                                        index={index}
                                                        onCardClick={(c) => openEditDialog && openEditDialog(c)}
                                                        onCheckChange={handleCheckChange}
                                                        isSelected={selectedCards.includes(customer.id)}
                                                    />
                                                ))}
                                                {provided.placeholder}

                                                {/* TOMBOL LOAD MORE */}
                                                {hasMore && (
                                                    <div className="py-2 text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleLoadMore(stage)}
                                                            className="w-full text-xs text-muted-foreground hover:text-primary h-8"
                                                        >
                                                            <ChevronDown className="h-3 w-3 mr-1" />
                                                            Muat ({stats.totalCount - columnCustomers.length}) lagi
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </DragDropContext>
        </div>
    );
}
