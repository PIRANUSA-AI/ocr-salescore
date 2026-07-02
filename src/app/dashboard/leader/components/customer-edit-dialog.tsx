

'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { PRODUCT_LIST, PIPELINE_STAGES, type Customer, type ProductName, PipelineStatus, CUSTOMER_SOURCES, CustomerSource } from '@/types';

// This is a shared prop type now
export interface CustomerEditDialogProps {
    editDialogState: { isOpen: boolean, customer: Customer | null };
    closeCustomerEditDialog: () => void;
    handleUpdateCustomer: (data: any) => Promise<void>;
    handleCreateCustomer: (data: any) => Promise<void>;
}

// Specific sources for the manual "Add Customer" dialog
const MANUAL_CUSTOMER_SOURCES: CustomerSource[] = ['Pameran', 'Workshop', 'Visit', 'Training', 'Troubleshoot', 'Telepon Masuk', 'Rekomendasi', 'Lainnya'];


const ProductSchema = z.object({
  id: z.string().optional(),
  name: z.enum(PRODUCT_LIST, { required_error: 'Produk harus dipilih.' }),
  purchaseDate: z.date({ required_error: 'Tanggal beli wajib diisi.'}),
  version: z.string().optional(),
  quantity: z.coerce.number().min(1, 'Jumlah minimal 1.').default(1),
});

// A single schema for both adding and editing
const CustomerInputSchema = z.object({
  customerId: z.string().optional(), // Optional for new customers
  name: z.string().min(1, 'Nama wajib diisi.'),
  email: z.string().email('Email tidak valid.').optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  products: z.array(ProductSchema).optional(),
  potentialRevenue: z.coerce.number().optional(),
  pipelineStatus: z.enum(PIPELINE_STAGES).optional(),
  
  // New Acquisition Context
  acquisitionContext: z.object({
      source: z.enum(CUSTOMER_SOURCES, { required_error: "Sumber interaksi harus dipilih." }),
      eventName: z.string().min(1, 'Nama/Konteks Acara wajib diisi.'),
      eventDate: z.date({ required_error: 'Tanggal Acara/Interaksi wajib diisi.' }),
  }),
  
  notes: z.string().optional(),
  creatorTeam: z.enum(['AEC', 'MFG']).optional(),
});


type FormData = z.infer<typeof CustomerInputSchema>;


export function CustomerEditDialog({ editDialogState, closeCustomerEditDialog, handleUpdateCustomer, handleCreateCustomer }: CustomerEditDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    
    const { customer, isOpen } = editDialogState;
    const isEditMode = !!customer;

    const form = useForm<FormData>({
        resolver: zodResolver(CustomerInputSchema),
    });

    useEffect(() => {
        if (isOpen) {
            if (isEditMode && customer) {
                 form.reset({
                    customerId: customer.id,
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone,
                    company: customer.company,
                    jobTitle: customer.jobTitle,
                    products: customer.products.map(p => ({
                        ...p,
                        purchaseDate: new Date(p.purchaseDate),
                    })),
                    potentialRevenue: customer.potentialRevenue,
                    pipelineStatus: customer.pipelineStatus,
                    acquisitionContext: {
                        source: customer.acquisitionContext?.source || 'Lainnya',
                        eventName: customer.acquisitionContext?.eventName || '',
                        eventDate: customer.acquisitionContext?.eventDate ? new Date(customer.acquisitionContext.eventDate) : new Date(),
                    },
                    notes: '', // Notes are not edited in this dialog
                });
            } else {
                 form.reset({
                    customerId: undefined,
                    name: '',
                    email: '',
                    phone: '',
                    company: '',
                    jobTitle: '',
                    products: [],
                    potentialRevenue: 0,
                    pipelineStatus: 'Leads Generation 10%',
                    acquisitionContext: {
                        source: 'Lainnya',
                        eventName: '',
                        eventDate: new Date(),
                    },
                    notes: '',
                });
            }
        }
    }, [customer, isOpen, isEditMode, form]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "products"
    });

    const handleClose = () => {
        if (isLoading) return;
        closeCustomerEditDialog();
    };

    const onSubmit = async (data: FormData) => {
        setIsLoading(true);
        try {
            if (isEditMode) {
                await handleUpdateCustomer(data);
            } else {
                await handleCreateCustomer(data);
            }
        } catch (error) {
            // Error toast is handled in the context, so we just catch to stop the loading state
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[700px] grid-rows-[auto_1fr_auto]">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit Pelanggan' : 'Tambah Pelanggan Manual'}</DialogTitle>
                    <DialogDescription>
                      {isEditMode ? `Perbarui detail untuk ${customer?.name}.` : 'Masukkan detail pelanggan dan produk yang mereka beli.'}
                    </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={form.handleSubmit(onSubmit)} id="customer-form">
                    <div className="space-y-6 py-4 overflow-y-auto pr-3" style={{maxHeight: '70vh'}}>
                        {/* Customer Details */}
                        <div className="space-y-2">
                             <h4 className="font-semibold text-sm text-foreground">Informasi Pelanggan</h4>
                             <div className="grid grid-cols-2 gap-4 rounded-md border p-4">
                                <div>
                                    <Label htmlFor="name">Nama Lengkap</Label>
                                    <Input id="name" {...form.register('name')} disabled={isLoading} />
                                    {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" type="email" {...form.register('email')} disabled={isLoading} />
                                    {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="phone">No. Telepon</Label>
                                    <Input id="phone" {...form.register('phone')} disabled={isLoading} />
                                </div>
                                <div>
                                    <Label htmlFor="company">Perusahaan</Label>
                                    <Input id="company" {...form.register('company')} disabled={isLoading} />
                                </div>
                                <div className="col-span-2">
                                    <Label htmlFor="jobTitle">Jabatan</Label>
                                    <Input id="jobTitle" {...form.register('jobTitle')} disabled={isLoading} />
                                </div>
                                <div>
                                    <Label htmlFor="potentialRevenue">Potensi Pendapatan (Rp)</Label>
                                    <Input 
                                      id="potentialRevenue" 
                                      type="number" 
                                      {...form.register('potentialRevenue')} 
                                      disabled={isLoading} 
                                      placeholder="e.g., 5000000"
                                    />
                                    {form.formState.errors.potentialRevenue && <p className="text-sm text-destructive">{form.formState.errors.potentialRevenue.message}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="pipelineStatus">Status Pipeline</Label>
                                     <Controller
                                        name="pipelineStatus"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih status..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {PIPELINE_STAGES.map(stage => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                             </div>
                        </div>

                        {/* Acquisition Context Section */}
                        <div className="space-y-2">
                            <h4 className="font-semibold text-sm text-foreground">Konteks Akuisisi</h4>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-4">
                                <div className="space-y-1">
                                    <Label>Sumber Interaksi</Label>
                                    <Controller
                                        name="acquisitionContext.source"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih sumber..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {MANUAL_CUSTOMER_SOURCES.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Tanggal Interaksi</Label>
                                     <Controller
                                        name="acquisitionContext.eventDate"
                                        control={form.control}
                                        render={({ field }) => <DatePicker date={field.value} setDate={field.onChange} disabled={isLoading} />}
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-1">
                                    <Label>Nama Event / Konteks</Label>
                                    <Input {...form.register('acquisitionContext.eventName')} placeholder="Contoh: Pameran MFI 2025, Visit ke PT ABC" disabled={isLoading} />
                                    {form.formState.errors.acquisitionContext?.eventName && <p className="text-sm text-destructive">{form.formState.errors.acquisitionContext.eventName.message}</p>}
                                </div>
                            </div>
                        </div>

                         {/* Product Details */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="font-semibold text-sm text-foreground">Informasi Produk</h4>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => append({ name: PRODUCT_LIST[0] as ProductName, purchaseDate: new Date(), version: '', quantity: 1 })}
                                >
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Tambah Produk
                                </Button>
                            </div>
                            {fields.map((field, index) => (
                                <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 rounded-md border p-4 relative">
                                     <div className="md:col-span-2">
                                        <Label>Nama Produk</Label>
                                        <Controller
                                            name={`products.${index}.name`}
                                            control={form.control}
                                            render={({ field: controllerField }) => (
                                                <Select onValueChange={controllerField.onChange} value={controllerField.value} disabled={isLoading}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Pilih produk..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {PRODUCT_LIST.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {form.formState.errors.products?.[index]?.name && <p className="text-sm text-destructive">{form.formState.errors.products?.[index]?.name?.message}</p>}
                                    </div>
                                    <div className="md:col-span-2">
                                        <Label>Tanggal Pembelian</Label>
                                        <Controller
                                            name={`products.${index}.purchaseDate`}
                                            control={form.control}
                                            render={({ field: controllerField }) => (
                                                <DatePicker date={controllerField.value} setDate={controllerField.onChange} disabled={isLoading} />
                                            )}
                                        />
                                        {form.formState.errors.products?.[index]?.purchaseDate && <p className="text-sm text-destructive">{form.formState.errors.products?.[index]?.purchaseDate?.message}</p>}
                                    </div>
                                    <div>
                                        <Label htmlFor={`products.${index}.version`}>Versi</Label>
                                        <Input id={`products.${index}.version`} {...form.register(`products.${index}.version`)} placeholder="e.g., 2025" disabled={isLoading} />
                                    </div>
                                    <div>
                                        <Label htmlFor={`products.${index}.quantity`}>Jumlah</Label>
                                        <Input id={`products.${index}.quantity`} type="number" {...form.register(`products.${index}.quantity`)} min="1" disabled={isLoading} />
                                        {form.formState.errors.products?.[index]?.quantity && <p className="text-sm text-destructive">{form.formState.errors.products?.[index]?.quantity?.message}</p>}
                                    </div>
                                    {(fields.length > 0 || !isEditMode && fields.length > 1) && (
                                        <div className="col-span-full flex justify-end md:absolute md:top-3 md:right-3">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive"
                                                onClick={() => remove(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {!isEditMode && (
                             <div className="space-y-2">
                                <Label htmlFor="notes">Catatan Tambahan</Label>
                                <Textarea 
                                    id="notes" 
                                    {...form.register('notes')} 
                                    placeholder="Contoh: Pelanggan ini bertanya tentang fitur X dan butuh penawaran segera."
                                    disabled={isLoading} 
                                />
                             </div>
                        )}
                    </div>
                </form>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>Batal</Button>
                    <Button type="submit" form="customer-form" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isEditMode ? 'Simpan Perubahan' : 'Simpan Pelanggan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}