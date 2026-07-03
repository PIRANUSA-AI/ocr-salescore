

'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Clock, Gift, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { Customer, FollowUpTasks } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MyCustomersView } from './sales/my-customers-view';
import { CustomerEditDialog } from './leader/components/customer-edit-dialog';
import { useDashboard } from './leader/context/dashboard-context';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { SalesDealsToolbar } from './sales/deals-toolbar';
import * as XLSX from 'xlsx';
import { FadeIn } from '@/components/ui/fade-in';
import CompanyView from './leader/views/company-view';
import MediaLibraryView from './leader/views/media-library-view';
import EmailBlastView from './leader/views/email-blast-view';
import OcrCaptureViewWrapper from './leader/views/ocr-capture-view';
import HistoryViewWrapper from './leader/views/history-view';
// import TodoView from './leader/views/todo-view'; // Task-to-Do (MySQL) dinonaktifkan — fully Firebase

const KanbanBoard = dynamic(() => import('./kanban-board'), {
    ssr: false,
    loading: () => <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});

// Use dynamic import for the heavy SalesAssistantPage component
const SalesAssistantPage = dynamic(() => import('./sales-assistant/page'), {
    loading: () => <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});


const EmptyState = ({ title, description }: { title: string, description: string }) => (
    <Card className="w-full border-dashed">
        <CardContent className="p-10 text-center">
            <h3 className="font-headline text-xl font-semibold text-foreground">{title}</h3>
            <p className="text-muted-foreground mt-2">
                {description}
            </p>
        </CardContent>
    </Card>
);

const MyTasksTabContent = ({ onNavigateToAssistant }: { onNavigateToAssistant: (customerId: string, context: string) => void }) => {
    const { customers, tasks, isLoading: isContextLoading } = useDashboard();
    const [featureConfig, setFeatureConfig] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const configRef = doc(db, 'appConfig', 'maintenance');
        getDoc(configRef).then(docSnap => {
            if (docSnap.exists()) {
                setFeatureConfig(docSnap.data().features);
            }
        });
    }, []);

    const handleCreateMessageClick = (task: any) => {
        const customer = customers.find(c => c.id === task.customerId);
        if (customer) {
            let taskContext = '';
            if (task.daysRemaining !== undefined) { // Renewal
                taskContext = `Renewal untuk produk ${task.productName} yang akan berakhir dalam ${task.daysRemaining} hari.`;
            } else if (task.purchaseDate) { // Aftersales
                taskContext = `Follow-up aftersales untuk pembelian produk ${task.productName}.`;
            } else { // Opportunity
                taskContext = `Peluang cross-sell: tawarkan ${task.recommendedProduct} karena pelanggan sudah memiliki ${task.triggeringProduct}. Alasan: ${task.reason}`;
            }
            onNavigateToAssistant(customer.id, taskContext);
        }
    };

    const isFeatureEnabled = (featureId: keyof typeof featureConfig) => {
        return featureConfig[featureId] ?? true;
    }

    const TaskCard = ({ title, icon, tasks: taskItems, type, isLoading }: { title: string, icon: React.ReactNode, tasks: any[], type: keyof Omit<FollowUpTasks, 'update'>, isLoading?: boolean }) => {

        const renderInfoCell = (task: any) => {
            switch (type) {
                case 'renewal':
                    return <>
                        <div className="font-medium">{task.productName}</div>
                        <div className={`text-sm ${task.daysRemaining <= 7 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                            {task.daysRemaining === 0 ? 'hari ini' : `${task.daysRemaining} hari lagi`}
                        </div>
                    </>;
                case 'aftersales':
                    return <>
                        <div className="font-medium">{task.productName}</div>
                        <div className="text-sm text-muted-foreground">30 hari pasca-pembelian</div>
                    </>;
                case 'opportunity':
                    return <>
                        <div className="font-medium text-green-600">{task.recommendedProduct}</div>
                        <p className="text-sm text-muted-foreground italic line-clamp-2">"{task.reason}"</p>
                    </>;
                default:
                    return null;
            }
        };

        return (
            <Card>
                <CardHeader className="flex flex-row items-center gap-4">
                    {icon}
                    <CardTitle className="font-headline text-2xl font-bold w-fit">{title} ({taskItems.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="h-40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : taskItems.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Pelanggan</TableHead>
                                    <TableHead>Info Tugas</TableHead>
                                    <TableHead className="w-[150px]">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {taskItems.map((task) => (
                                    <TableRow key={`${type}-${task.id || task.customerId}-${task.productId || task.recommendedProduct}`} className="group hover:bg-muted/40 transition-colors duration-200">
                                        <TableCell>
                                            <Link href={`/dashboard/customer/${task.customerId}`} className="font-medium hover:text-primary inline-block hover:translate-x-1 transition-transform duration-200">
                                                {task.customerName}
                                            </Link>
                                            <div className="text-sm text-muted-foreground">{task.customerCompany}</div>
                                        </TableCell>
                                        <TableCell>{renderInfoCell(task)}</TableCell>
                                        <TableCell>
                                            <Button size="sm" onClick={() => handleCreateMessageClick(task)} className="transition-transform duration-200 hover:translate-x-0.5">Buat Pesan</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center text-sm text-muted-foreground py-10">Tidak ada tugas {title}.</div>
                    )}
                </CardContent>
            </Card>
        )
    };

    const totalTasks = (tasks.renewal?.length || 0) + (tasks.aftersales?.length || 0) + (tasks.opportunity?.length || 0);

    if (isContextLoading) {
        return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (totalTasks === 0) {
        return <EmptyState title="Tidak Ada Tugas" description="Semua pekerjaan Anda sudah selesai. Kerja bagus!" />;
    }

    return (
        <FadeIn className='space-y-6'>
            <Tabs defaultValue="renewal" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    {isFeatureEnabled('renewal') && <TabsTrigger value="renewal"><Clock className='mr-2 h-4 w-4' /> Renewal</TabsTrigger>}
                    {isFeatureEnabled('aftersales') && <TabsTrigger value="aftersales"><Gift className='mr-2 h-4 w-4' /> Aftersales</TabsTrigger>}
                    {isFeatureEnabled('opportunity') && (
                        <TabsTrigger value="peluang">
                            <div className="flex items-center gap-2">
                                <Sparkles className='h-4 w-4' />
                                <span>Peluang</span>
                                {isContextLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                            </div>
                        </TabsTrigger>
                    )}
                </TabsList>
                {isFeatureEnabled('renewal') && <TabsContent value="renewal">
                    <TaskCard title="Renewal" icon={<Clock className='w-6 h-6 text-primary' />} tasks={tasks.renewal} type="renewal" isLoading={isContextLoading} />
                </TabsContent>}
                {isFeatureEnabled('aftersales') && <TabsContent value="aftersales">
                    <TaskCard title="Aftersales" icon={<Gift className='w-6 h-6 text-primary' />} tasks={tasks.aftersales} type="aftersales" isLoading={isContextLoading} />
                </TabsContent>}
                {isFeatureEnabled('opportunity') && <TabsContent value="peluang">
                    <TaskCard title="Peluang" icon={<Sparkles className='w-6 h-6 text-primary' />} tasks={tasks.opportunity || []} type="opportunity" isLoading={isContextLoading} />
                </TabsContent>}
            </Tabs>
        </FadeIn>
    );
};

interface SalesDashboardProps {
    activeView: string;
}

export default function SalesDashboard({ activeView }: SalesDashboardProps) {
    const router = useRouter();
    const [selectedCards, setSelectedCards] = useState<string[]>([]);

    const {
        customers,
        isLoading,
        editDialogState,
        closeCustomerEditDialog,
        openCustomerEditDialog,
        handleUpdateCustomer,
        handleCreateCustomer,
        refreshAllData,
        handleBulkDelete,
        filteredCustomers,
    } = useDashboard();


    const handleCustomersChange = (updatedCustomers: Customer[]) => {
        // Since MyCustomersView now manages its state, we just need to trigger a global refresh
        // when a customer is added via OCR/Excel, which is handled by refreshAllData in the context.
        refreshAllData();
    };

    const handleNavigateToAssistant = (customerId: string, context: string) => {
        router.push(`/dashboard?view=sales-assistant&customerId=${customerId}&context=${encodeURIComponent(context)}`);
    };

    const handleDownload = () => {
        const dataToExport = selectedCards.length > 0
            ? filteredCustomers.filter(c => selectedCards.includes(c.id))
            : filteredCustomers;

        if (dataToExport.length === 0) return;

        const flattenedData = dataToExport.map(c => ({
            'Nama': c.name,
            'Email': c.email,
            'Telepon': c.phone,
            'Perusahaan': c.company,
            'Jabatan': c.jobTitle,
            'Status Pipeline': c.pipelineStatus,
            'Potensi Pendapatan': c.potentialRevenue,
            'Sales Ditugaskan': c.assignedSalesName,
            'Sumber': c.acquisitionContext.source,
            'Dibuat pada': new Date(c.createdAt).toLocaleDateString('id-ID'),
            'Diperbarui pada': new Date(c.updatedAt).toLocaleDateString('id-ID'),
            'Produk': c.products.map(p => p.name).join(', ')
        }));

        const worksheet = XLSX.utils.json_to_sheet(flattenedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Deals");
        XLSX.writeFile(workbook, "SalesCore_Deals_Export.xlsx");
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex justify-center items-center h-96"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        }

        switch (activeView) {
            case 'ocr-capture':
                return <OcrCaptureViewWrapper />;
            case 'history':
                return <HistoryViewWrapper />;
            case 'tasks':
                return <MyTasksTabContent onNavigateToAssistant={handleNavigateToAssistant} />;
            case 'my-customers':
                return <MyCustomersView />;
            case 'company':
                return <CompanyView />;
            case 'media-library':
                return <MediaLibraryView />;
            case 'email-blast':
                return <EmailBlastView />;
            case 'to-do':
                // Task-to-Do (MySQL) dinonaktifkan — fully Firebase. Fallback ke Customers.
                // return <TodoView />;
                return <MyCustomersView />;
            case 'deals':
                if (customers.length === 0) {
                    return <EmptyState title="Pipeline Kosong" description="Belum ada pelanggan yang ditugaskan untuk Anda." />;
                }
                return (
                    <FadeIn className="flex flex-col h-full overflow-hidden pt-6">
                        <div className="overflow-x-auto w-full">
                            <Card className="min-w-max">
                                <CardHeader>
                                    <CardTitle className="font-headline text-3xl font-bold">Deals Pipeline</CardTitle>
                                    <CardDescription>Visualisasikan dan kelola pipeline penjualan Anda dalam tampilan kanban.</CardDescription>
                                    <div className="pt-4">
                                        <div className="pt-4">
                                            <SalesDealsToolbar
                                                selectedCards={selectedCards}
                                                onDownload={handleDownload}
                                                onBulkAssignComplete={() => setSelectedCards([])}
                                                onBulkDelete={() => {
                                                    handleBulkDelete(selectedCards);
                                                    setSelectedCards([]);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <KanbanBoard
                                        customers={filteredCustomers}
                                        onCustomersChange={handleCustomersChange}
                                        openCustomerEditDialog={openCustomerEditDialog}
                                        selectedCards={selectedCards}
                                        setSelectedCards={setSelectedCards}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </FadeIn>
                );
            case 'sales-assistant':
                return <SalesAssistantPage />;
            default:
                if (customers && customers.length > 0) {
                    return <MyTasksTabContent onNavigateToAssistant={handleNavigateToAssistant} />;
                }
                return <MyCustomersView />;
        }
    };

    return (
        <div className="w-full space-y-10 pb-10">
            <CustomerEditDialog
                editDialogState={editDialogState}
                closeCustomerEditDialog={closeCustomerEditDialog}
                handleUpdateCustomer={handleUpdateCustomer}
                handleCreateCustomer={handleCreateCustomer}
            />
            {renderContent()}
        </div>
    );
}
