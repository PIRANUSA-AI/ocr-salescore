'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, Gift, RefreshCw, Sparkles } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type UpdateTask, PRODUCT_LIST, type ProductName } from '@/types';
import { useDashboard } from '@/app/dashboard/dashboard-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { FadeIn } from '@/components/ui/fade-in';
import Link from 'next/link';

// This new component isolates the state and logic for the update filter,
// preventing the parent component from re-rendering on every keystroke.
const UpdateTaskFilter = () => {
    const { customers, salesTeam, handleAssignSalesToEntity } = useDashboard();
    const [selectedProduct, setSelectedProduct] = useState<ProductName | ''>('');
    const [targetVersion, setTargetVersion] = useState('');

    const updateTasks = useMemo((): UpdateTask[] => {
        if (!selectedProduct || !targetVersion) {
            return [];
        }
        return customers.reduce((acc: UpdateTask[], customer) => {
            const ownedProduct = customer.products.find(p => p.name === selectedProduct && p.version !== targetVersion);
            if (ownedProduct) {
                acc.push({
                    customerId: customer.id,
                    customerName: customer.name,
                    customerCompany: customer.company || '',
                    assignedSalesId: customer.assignedSalesId,
                    productId: ownedProduct.id,
                    productName: ownedProduct.name,
                    currentVersion: ownedProduct.version || 'N/A',
                });
            }
            return acc;
        }, []);
    }, [customers, selectedProduct, targetVersion]);

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkAssigning, setIsBulkAssigning] = useState(false);
    const [bulkAssignSalesId, setBulkAssignSalesId] = useState<string>('');

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(updateTasks.map(t => t.customerId));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (customerId: string, checked: boolean) => {
        setSelectedIds(prev => checked ? [...prev, customerId] : prev.filter(id => id !== customerId));
    };

    const handleBulkAssignAction = async () => {
        if (!bulkAssignSalesId || selectedIds.length === 0) return;

        setIsBulkAssigning(true);
        const selectedSales = salesTeam.find(s => s.id === bulkAssignSalesId);
        const salesName = selectedSales?.name || '';

        try {
            await Promise.all(selectedIds.map(id =>
                handleAssignSalesToEntity(id, bulkAssignSalesId, salesName, 'customer')
            ));

            setSelectedIds([]);
            setBulkAssignSalesId('');
        } catch (error) {
            console.error("Bulk assign failed", error);
        } finally {
            setIsBulkAssigning(false);
        }
    };

    const isAllSelected = updateTasks.length > 0 && selectedIds.length === updateTasks.length;

    const handleAssign = (task: any, salesId: string) => {
        const selectedSales = salesTeam.find(s => s.id === salesId);
        handleAssignSalesToEntity(task.customerId, salesId, selectedSales?.name || '', 'customer');
    };

    return (
        <Card>
            <CardHeader>
                <div className='flex items-center gap-4'>
                    <RefreshCw className='w-8 h-8 text-primary' />
                    <div>
                        <CardTitle className="font-headline text-2xl font-bold w-fit">Kampanye Update Produk</CardTitle>
                        <CardDescription>Cari pelanggan berdasarkan produk yang mereka miliki untuk ditawari versi terbaru.</CardDescription>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-4">
                    <div className='flex gap-4 items-center'>
                        <Select onValueChange={(val) => setSelectedProduct(val as ProductName)} value={selectedProduct}>
                            <SelectTrigger className="w-[250px]">
                                <SelectValue placeholder="Pilih produk..." />
                            </SelectTrigger>
                            <SelectContent>
                                {PRODUCT_LIST.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Input
                            className="w-[250px]"
                            placeholder="Ketik versi target (e.g., 2025)"
                            value={targetVersion}
                            onChange={(e) => setTargetVersion(e.target.value)}
                            disabled={!selectedProduct}
                        />
                    </div>
                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                            <Select value={bulkAssignSalesId} onValueChange={setBulkAssignSalesId} disabled={isBulkAssigning}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Pilih Sales..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Button onClick={handleBulkAssignAction} disabled={!bulkAssignSalesId || isBulkAssigning} size="sm">
                                {isBulkAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Apply ({selectedIds.length})
                            </Button>
                        </div>
                    )}
                </div>
                <div className='text-sm text-muted-foreground mt-2'>
                    {selectedProduct && targetVersion ? `Menampilkan pelanggan yang tidak memiliki versi ${targetVersion}` : 'Pilih produk dan versi untuk memulai.'}
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox
                                    checked={isAllSelected}
                                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                    disabled={updateTasks.length === 0}
                                />
                            </TableHead>
                            <TableHead>Pelanggan</TableHead>
                            <TableHead>Info Produk</TableHead>
                            <TableHead className="w-[200px]">Sales Ditugaskan</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {updateTasks.length > 0 ? (
                            updateTasks.map((task: any) => (
                                <TableRow key={`update-${task.customerId}-${task.productId}`}>
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedIds.includes(task.customerId)}
                                            onCheckedChange={(checked) => handleSelectRow(task.customerId, !!checked)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Link
                                            href={`/dashboard/customer/${task.customerId}`}
                                            className="font-medium hover:underline hover:text-primary transition-colors block"
                                        >
                                            {task.customerName}
                                        </Link>
                                        <div className="text-sm text-muted-foreground">{task.customerCompany}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{task.productName}</div>
                                        <div className="text-sm text-muted-foreground">Versi saat ini: {task.currentVersion || 'N/A'}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={task.assignedSalesId || 'unassigned'}
                                            onValueChange={(value) => handleAssign(task, value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Tugaskan..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="unassigned">Belum Ditugaskan</SelectItem>
                                                {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-24">{!selectedProduct || !targetVersion ? 'Pilih produk dan versi untuk melihat daftar pelanggan.' : 'Tidak ada pelanggan yang cocok.'}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};


export const FollowUpDashboard = () => {
    const { tasks, salesTeam, isLoading, isAiTaskLoading, handleAssignSalesToEntity, runAiTasks } = useDashboard();
    const [featureConfig, setFeatureConfig] = useState<Record<string, boolean>>({});
    const [loadingFeatures, setLoadingFeatures] = useState(true);

    useEffect(() => {
        const configRef = doc(db, 'appConfig', 'maintenance');
        getDoc(configRef).then(docSnap => {
            if (docSnap.exists()) {
                setFeatureConfig(docSnap.data().features || {});
            }
        }).finally(() => {
            setLoadingFeatures(false);
        });
    }, []);

    const isFeatureEnabled = (featureId: keyof typeof featureConfig) => {
        // Default to true if config hasn't loaded yet or key doesn't exist
        return featureConfig[featureId] ?? true;
    }

    // State for bulk selection: Map of tab -> Set of IDs
    const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({});
    const [isBulkAssigning, setIsBulkAssigning] = useState(false);
    const [bulkAssignSalesId, setBulkAssignSalesId] = useState<string>('');

    const FollowUpCard = ({ title, description, icon, tasks: taskItems, type, isLoading: isCardLoading }: { title: string, description: string, icon: React.ReactNode, tasks: any[], type: 'renewal' | 'aftersales' | 'opportunity', isLoading?: boolean }) => {
        const currentTasks = taskItems || [];
        const isOpportunityTab = type === 'opportunity';
        const currentLoading = isCardLoading ?? (isOpportunityTab ? isAiTaskLoading : isLoading);

        // Selection Logic
        const tabKey = type;
        const currentSelection = selectedItems[tabKey] || [];

        const getRowId = (task: any) => isOpportunityTab ? task.id : task.customerId;

        const handleSelectAll = (checked: boolean) => {
            if (checked) {
                const allIds = currentTasks.map(getRowId);
                setSelectedItems(prev => ({ ...prev, [tabKey]: allIds }));
            } else {
                setSelectedItems(prev => ({ ...prev, [tabKey]: [] }));
            }
        };

        const handleSelectRow = (id: string, checked: boolean) => {
            setSelectedItems(prev => {
                const prevSelection = prev[tabKey] || [];
                return {
                    ...prev,
                    [tabKey]: checked
                        ? [...prevSelection, id]
                        : prevSelection.filter(item => item !== id)
                };
            });
        };

        const handleBulkAssignAction = async () => {
            if (!bulkAssignSalesId || currentSelection.length === 0) return;

            setIsBulkAssigning(true);
            const selectedSales = salesTeam.find(s => s.id === bulkAssignSalesId);
            const salesName = selectedSales?.name || '';
            const entityType = isOpportunityTab ? 'task' : 'customer';

            try {
                await Promise.all(currentSelection.map(id =>
                    handleAssignSalesToEntity(id, bulkAssignSalesId, salesName, entityType)
                ));

                // Clear selection after success
                setSelectedItems(prev => ({ ...prev, [tabKey]: [] }));
                setBulkAssignSalesId('');
            } catch (error) {
                console.error("Bulk assign failed", error);
            } finally {
                setIsBulkAssigning(false);
            }
        };

        const isAllSelected = currentTasks.length > 0 && currentSelection.length === currentTasks.length;

        const getDaysText = (days: number) => {
            if (days === 0) return 'hari ini';
            return `${days} hari lagi`;
        };

        const renderInfoCell = (task: any) => {
            switch (type) {
                case 'renewal':
                    return <><div className="font-medium">{task.productName}</div><div className={`text-sm ${task.daysRemaining <= 7 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{getDaysText(task.daysRemaining)}</div></>;
                case 'aftersales':
                    return <><div className="font-medium">{task.productName}</div><div className="text-sm text-muted-foreground">30 hari pasca-pembelian</div></>;
                case 'opportunity':
                    return (
                        <div>
                            <div className="font-medium text-green-600">{task.recommendedProduct}</div>
                            <p className="text-sm text-muted-foreground italic line-clamp-2">"{task.reason}"</p>
                        </div>
                    );
                default:
                    return null;
            }
        }

        const handleAssign = (task: any, salesId: string) => {
            const selectedSales = salesTeam.find(s => s.id === salesId);
            if (isOpportunityTab) {
                handleAssignSalesToEntity(task.id, salesId, selectedSales?.name || '', 'task');
            } else {
                handleAssignSalesToEntity(task.customerId, salesId, selectedSales?.name || '', 'customer');
            }
        }


        return (
            <Card>
                <CardHeader>
                    <div className='flex items-center justify-between flex-wrap gap-4'>
                        <div className='flex items-center gap-4'>
                            {icon}
                            <div>
                                <CardTitle className="font-headline text-2xl font-bold w-fit">{title}</CardTitle>
                                <CardDescription>{description}</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {currentSelection.length > 0 && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                                    <Select value={bulkAssignSalesId} onValueChange={setBulkAssignSalesId} disabled={isBulkAssigning}>
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder="Pilih Sales..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button onClick={handleBulkAssignAction} disabled={!bulkAssignSalesId || isBulkAssigning} size="sm">
                                        {isBulkAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Apply ({currentSelection.length})
                                    </Button>
                                </div>
                            )}
                            {isOpportunityTab && (
                                <Button variant="outline" onClick={runAiTasks} disabled={isAiTaskLoading}>
                                    {isAiTaskLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Generate Ulang Tugas Peluang AI
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={isAllSelected}
                                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                        disabled={currentLoading || currentTasks.length === 0}
                                    />
                                </TableHead>
                                <TableHead>Pelanggan</TableHead>
                                <TableHead>Info Tugas</TableHead>
                                <TableHead className="w-[200px]">Sales Ditugaskan</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {currentLoading ? (
                                <TableRow><TableCell colSpan={4} className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                            ) : currentTasks.length > 0 ? (
                                currentTasks.map((task: any) => (
                                    <TableRow key={`${type}-${task.id || task.customerId}-${task.productId || task.recommendedProduct}`}>
                                        <TableCell>
                                            <Checkbox
                                                checked={currentSelection.includes(getRowId(task))}
                                                onCheckedChange={(checked) => handleSelectRow(getRowId(task), !!checked)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Link
                                                href={`/dashboard/customer/${task.customerId}`}
                                                className="font-medium hover:underline hover:text-primary transition-colors block"
                                            >
                                                {task.customerName}
                                            </Link>
                                            <div className="text-sm text-muted-foreground">{task.customerCompany}</div>
                                        </TableCell>
                                        <TableCell>
                                            {renderInfoCell(task)}
                                        </TableCell>
                                        <TableCell>
                                            <Select
                                                value={task.assignedSalesId || 'unassigned'}
                                                onValueChange={(value) => handleAssign(task, value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Tugaskan..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="unassigned">Belum Ditugaskan</SelectItem>
                                                    {salesTeam.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-24">Tidak ada tugas yang cocok.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        );
    };

    const enabledTabs = useMemo(() => {
        const tabs = [];
        if (isFeatureEnabled('renewal')) tabs.push({ value: 'renewal', label: 'Renewal', icon: <Clock className='mr-2 h-4 w-4' /> });
        if (isFeatureEnabled('aftersales')) tabs.push({ value: 'aftersales', label: 'Aftersales', icon: <Gift className='mr-2 h-4 w-4' /> });
        if (isFeatureEnabled('update')) tabs.push({ value: 'update', label: 'Update', icon: <RefreshCw className='mr-2 h-4 w-4' /> });
        if (isFeatureEnabled('opportunity')) tabs.push({ value: 'peluang', label: 'Peluang', icon: <Sparkles className='mr-2 h-4 w-4' /> });
        return tabs;
    }, [featureConfig]);

    if (loadingFeatures) {
        return <div className='flex justify-center items-center h-64'><Loader2 className='h-8 w-8 animate-spin' /></div>
    }

    if (enabledTabs.length === 0) {
        return (
            <div className='text-center p-8 border-2 border-dashed rounded-lg'>
                <p className='text-muted-foreground'>Semua fitur tugas dinonaktifkan oleh Superadmin.</p>
            </div>
        )
    }

    return (
        <FadeIn>
            <Tabs defaultValue={enabledTabs[0].value} className="w-full">
                <TabsList className={`grid w-full grid-cols-${enabledTabs.length}`}>
                    {enabledTabs.map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value}>
                            <div className="flex items-center gap-2">
                                {tab.icon}
                                <span>{tab.label}</span>
                                {tab.value === 'peluang' && isAiTaskLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            </div>
                        </TabsTrigger>
                    ))}
                </TabsList>

                {isFeatureEnabled('renewal') && <TabsContent value="renewal">
                    <FollowUpCard title="Tugas Renewal" description="Pelanggan dengan lisensi yang akan berakhir dalam 14 hari." icon={<Clock className='w-8 h-8 text-primary' />} tasks={tasks.renewal} type="renewal" isLoading={isLoading} />
                </TabsContent>}
                {isFeatureEnabled('aftersales') && <TabsContent value="aftersales">
                    <FollowUpCard title="Tugas Aftersales" description="Pelanggan yang tepat 30 hari lalu melakukan pembelian." icon={<Gift className='w-8 h-8 text-primary' />} tasks={tasks.aftersales} type="aftersales" isLoading={isLoading} />
                </TabsContent>}
                {isFeatureEnabled('update') && <TabsContent value="update">
                    <UpdateTaskFilter />
                </TabsContent>}
                {isFeatureEnabled('opportunity') && <TabsContent value="peluang">
                    <FollowUpCard title="Tugas Peluang (AI)" description="Rekomendasi cross-sell/upsell berdasarkan software yang dimiliki pelanggan." icon={<Sparkles className='w-8 h-8 text-primary' />} tasks={tasks.opportunity || []} type="opportunity" isLoading={isAiTaskLoading} />
                </TabsContent>}
            </Tabs>
        </FadeIn>
    );
};
