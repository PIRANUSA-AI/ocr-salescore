'use client';
import { useState } from 'react';
import { useDashboard } from '@/app/dashboard/dashboard-context';
import KanbanBoard from '../../_components/kanban-board';
import { CustomerEditDialog } from '../../_components/leader/customer-edit-dialog';
import { DealsToolbar } from '../../_components/leader/deals-toolbar';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function DealsView() {
  const {
    filteredCustomers,
    refreshAllData,
    openCustomerEditDialog,
    editDialogState,
    closeCustomerEditDialog,
    handleUpdateCustomer,
    handleCreateCustomer,
    handleBulkDelete,
    handleBulkAssign
  } = useDashboard();

  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const handleCustomersChange = (updatedCustomers: any) => {
    refreshAllData();
  }

  const formatNotes = (notes: any, formAnswers?: any[]): string => {
    const parts: string[] = [];
    if (notes && typeof notes === 'object') {
      const manualRaw = notes.manual?.trim() || '';
      if (manualRaw) {
        const cut = manualRaw.indexOf('[Data dari Form OCR]');
        const manualClean = (cut >= 0 ? manualRaw.slice(0, cut) : manualRaw).trim();
        if (manualClean) parts.push(manualClean);
      }
      if (notes.webinar?.length) parts.push(notes.webinar.map((w: any) => `[Webinar] ${w.text}`).join('; '));
      if (notes.replyAssistant?.length) parts.push(notes.replyAssistant.map((r: any) => `[AI] ${r.text}`).join('; '));
    }
    if (formAnswers?.length) {
      const formData = formAnswers.filter((fa: any) => fa.answer?.trim()).map((fa: any) => `${fa.question}: ${fa.answer}`).join('\n');
      if (formData) parts.push(formData);
    }
    return parts.join('\n---\n');
  };

  const handleDownload = () => {
    const dataToExport = selectedCards.length > 0
      ? filteredCustomers.filter(c => selectedCards.includes(c.id))
      : filteredCustomers;

    if (dataToExport.length === 0) return;

    // Flatten data for export
    const flattenedData = dataToExport.map(c => ({
      'Nama': c.name,
      'Email': c.email,
      'Telepon': c.phone,
      'Perusahaan': c.company,
      'Jabatan': c.jobTitle,
      'Status Pipeline': c.pipelineStatus,
      'Potensi Pendapatan': c.potentialRevenue,
      'Sales Ditugaskan': c.assignedSalesName,
      'Sumber': c.acquisitionContext?.source || '-',
      'Catatan': formatNotes(c.notes, c.formAnswers),
      'Dibuat pada': new Date(c.createdAt).toLocaleDateString('id-ID'),
      'Diperbarui pada': new Date(c.updatedAt).toLocaleDateString('id-ID'),
      'Produk': c.products.map(p => p.name).join(', ')
    }));

    const worksheet = XLSX.utils.json_to_sheet(flattenedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Deals");
    XLSX.writeFile(workbook, "SalesCore_Deals_Export.xlsx");
  };


  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-1 w-full h-full min-h-0">
        <Card className="h-full flex flex-col border-0 shadow-none">
          <CardHeader className="flex flex-col space-y-1.5 p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="font-headline text-3xl font-bold">Deals Pipeline</CardTitle>
                <CardDescription>Visualisasikan dan kelola pipeline penjualan Anda dalam tampilan kanban.</CardDescription>
              </div>
            </div>
            <div className="pt-4">
              <DealsToolbar
                selectedCount={selectedCards.length}
                onDownload={handleDownload}
                onBulkDelete={() => {
                  handleBulkDelete(selectedCards);
                  setSelectedCards([]);
                }}
                onBulkAssign={(newSalesId) => {
                  handleBulkAssign(selectedCards, newSalesId);
                  setSelectedCards([]);
                }}
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 min-h-0 overflow-hidden">
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
      <CustomerEditDialog
        editDialogState={editDialogState}
        closeCustomerEditDialog={closeCustomerEditDialog}
        handleUpdateCustomer={handleUpdateCustomer}
        handleCreateCustomer={handleCreateCustomer}
      />
    </div>
  );
}
