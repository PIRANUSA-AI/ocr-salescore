import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CustomerManager } from '../components/customer-manager';
import { CustomerEditDialog } from '../components/customer-edit-dialog';
import { useDashboard } from '../context/dashboard-context';

export default function CustomerManagementView() {
  const {
    editDialogState,
    closeCustomerEditDialog,
    handleUpdateCustomer,
    handleCreateCustomer,
    customers,
    openCustomerEditDialog,
    isLoading
  } = useDashboard();

  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const customerId = searchParams.get('id');
    if (customerId && !isLoading && customers.length > 0 && !editDialogState.isOpen) {
      const targetCustomer = customers.find(c => c.id === customerId);
      if (targetCustomer) {
        openCustomerEditDialog(targetCustomer);
        // Optional: clear URL param to prevent reopening on generic refresh, 
        // but keeping it allows bookmarking.
        // Let's keep it for now, or use replace to clean it up?
        // Better to clean up so it doesn't annoy the user if they close dialog and refresh.
        // router.replace('/dashboard?view=customer-manager', { scroll: false });
      }
    }
  }, [searchParams, customers, isLoading, editDialogState.isOpen, openCustomerEditDialog]);

  return (
    <div className="space-y-6">
      <CustomerManager />
      <CustomerEditDialog
        editDialogState={editDialogState}
        closeCustomerEditDialog={() => {
          closeCustomerEditDialog();
          // Clear ID from URL when dialog closes
          if (searchParams.get('id')) {
            router.replace('/dashboard?view=customer-manager', { scroll: false });
          }
        }}
        handleUpdateCustomer={handleUpdateCustomer}
        handleCreateCustomer={handleCreateCustomer}
      />
    </div>
  );
}
