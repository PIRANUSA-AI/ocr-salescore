'use client';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { type Customer, type UserProfile, type FollowUpTasks, type AnalysisHistoryEntry, ProspectData, ActivityLog, WebinarAnalysisOutput, PipelineStatus } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getAllCustomers, getFollowUpTasks, runAndSaveAiOpportunityTasks, getOpportunityTasksFromDb, assignSalesToEntity, updateCustomer, createManualCustomer, deleteCustomer } from '@/app/actions/leader';
import { getAssignedCustomers } from '@/app/actions/sales';
import { getSalesUsers } from '@/app/actions/user';
import { getAnalysisHistory, deleteAnalysis, assignProspects, analyzeWebinar, generateTopicRecommendationsForAnalysis, generateWebinarInsights } from '@/app/actions/analyze';
import { getActivityLogs } from '@/app/actions/activity';
import type { WebinarAnalysisInput, WebinarAnalysisResult } from '@/app/actions/analyze';
import { endOfDay, startOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';

type AnalysisDisplayResult = Extract<WebinarAnalysisResult, { success: true }>;

interface DashboardContextType {
  customers: Customer[];
  filteredCustomers: Customer[];
  salesTeam: (UserProfile & { id: string })[];
  tasks: Omit<FollowUpTasks, 'update' | 'webinar'>;
  analysisHistory: AnalysisHistoryEntry[];
  activityLogs: ActivityLog[];
  isLoading: boolean;
  isAiTaskLoading: boolean;
  isAnalysisLoading: boolean;
  isDeletingAnalysis: boolean;
  isTopicLoading: string | null;
  isInsightsLoading: string | null;
  refreshAllData: () => void;
  runAiTasks: () => void;
  handleAssignSalesToEntity: (entityId: string, salesId: string, salesName: string, entityType: 'customer' | 'task') => Promise<void>;
  handleDeleteAnalyses: (analysisIds: string[]) => Promise<void>;
  handleAssignProspects: (analysisId: string, prospects: ProspectData[], salesId: string, salesName: string) => Promise<void>;
  handleStartAnalysis: (input: Omit<WebinarAnalysisInput, 'rsvpData'>) => Promise<void>;
  handleGenerateTopics: (analysisId: string) => Promise<void>;
  handleGenerateInsights: (analysisId: string) => Promise<void>;
  editDialogState: { isOpen: boolean, customer: Customer | null };
  openCustomerEditDialog: (customer: Customer | null) => void;
  closeCustomerEditDialog: () => void;
  handleUpdateCustomer: (customerData: any) => Promise<void>;
  handleCreateCustomer: (customerData: any) => Promise<void>;
  dealsFilters: { search: string; salesId: string; dateRange: DateRange | null; };
  setDealsFilters: React.Dispatch<React.SetStateAction<{ search: string; salesId: string; dateRange: DateRange | null; }>>;
  handleBulkDelete: (customerIds: string[]) => Promise<void>;
  handleBulkAssign: (customerIds: string[], newSalesId: string) => Promise<void>;
  userProfile?: UserProfile | null;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesTeam, setSalesTeam] = useState<(UserProfile & { id: string })[]>([]);
  const [tasks, setTasks] = useState<Omit<FollowUpTasks, 'update' | 'webinar'>>({ renewal: [], aftersales: [], opportunity: [] });
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAiTaskLoading, setIsAiTaskLoading] = useState(false);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [isDeletingAnalysis, setIsDeletingAnalysis] = useState(false);
  const [isTopicLoading, setIsTopicLoading] = useState<string | null>(null);
  const [isInsightsLoading, setIsInsightsLoading] = useState<string | null>(null);

  const [editDialogState, setEditDialogState] = useState<{ isOpen: boolean, customer: Customer | null }>({ isOpen: false, customer: null });

  const [dealsFilters, setDealsFilters] = useState<{ search: string; salesId: string; dateRange: DateRange | null; }>({ search: '', salesId: 'all', dateRange: null });

  const fetchFastData = useCallback(async () => {
    if (!user || !userProfile) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const salesTeamPromise = getSalesUsers().then(users =>
        users.filter(u => userProfile.role !== 'Leader' || u.team === userProfile.team)
      );

      const [salesData] = await Promise.all([salesTeamPromise]);
      const formattedSales = salesData.map(s => ({ ...s, id: s.uid }));
      setSalesTeam(formattedSales);

      const customersPromise =
          userProfile.role === 'Superadmin'
            ? getAllCustomers()
            : userProfile.role === 'Leader'
            ? getAllCustomers().then(allCustomers => allCustomers.filter(c => {
              const isTeamMatch = c.team === userProfile.team;
              const teamSalesIds = formattedSales.map(s => s.id);
              const isAssignedToTeam = c.assignedSalesId && teamSalesIds.includes(c.assignedSalesId);
              return isTeamMatch || isAssignedToTeam;
            }))
            : getAssignedCustomers(user.uid);

      const [customersData] = await Promise.all([customersPromise]);
      setCustomers(customersData);

      const customerIdsOfTeam = new Set(customersData.map(c => c.id));

      const tasksDataPromise = getFollowUpTasks().then(allTasks => ({
        renewal: allTasks.renewal.filter(t => customerIdsOfTeam.has(t.customerId)),
        aftersales: allTasks.aftersales.filter(t => customerIdsOfTeam.has(t.customerId)),
      }));

      const opportunityTasksPromise = getOpportunityTasksFromDb().then(allOppTasks =>
        allOppTasks.filter(t => customerIdsOfTeam.has(t.customerId))
      );

      const historyDataPromise = getAnalysisHistory(user.uid);
      const logsDataPromise = getActivityLogs(30);

      const [tasksResult, opportunityResult, historyResult, logsResult] = await Promise.allSettled([
        tasksDataPromise,
        opportunityTasksPromise,
        historyDataPromise,
        logsDataPromise,
      ]);

      if (tasksResult.status === 'fulfilled') {
        setTasks({ ...tasksResult.value, opportunity: opportunityResult.status === 'fulfilled' ? opportunityResult.value : [] });
      }
      if (historyResult.status === 'fulfilled') {
        setAnalysisHistory(historyResult.value);
      }
      if (logsResult.status === 'fulfilled') {
        setActivityLogs(logsResult.value as ActivityLog[]);
      }
    } catch (error) {
      console.error("[DashboardContext] Failed to fetch initial data:", error);
      toast({ variant: 'destructive', title: 'Gagal Memuat Data', description: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [toast, user, userProfile]);

  const runAiTasks = useCallback(async () => {
    if (!user || !userProfile) return;
    setIsAiTaskLoading(true);
    try {
      const opportunityTasks = await runAndSaveAiOpportunityTasks();
      const salesTeamForFilter = salesTeam.length > 0 ? salesTeam : (await getSalesUsers().then(users => users.filter(u => u.team === userProfile.team)));
      const teamSalesIds = salesTeamForFilter.map(s => s.uid);
      const customersForFilter = customers.length > 0 ? customers : (await getAllCustomers().then(allCustomers => allCustomers.filter(c => !c.assignedSalesId || teamSalesIds.includes(c.assignedSalesId!))));
      const customerIdsOfTeam = new Set(customersForFilter.map(c => c.id));
      const filteredOpportunityTasks = opportunityTasks.filter(t => customerIdsOfTeam.has(t.customerId));
      setTasks(prev => ({ ...prev, opportunity: filteredOpportunityTasks }));
      toast({ title: 'Analisis AI Selesai', description: 'Tugas peluang baru telah dibuat berdasarkan data pelanggan terakhir.' });
    } catch (error) {
      console.error("[DashboardContext] Failed to fetch AI tasks:", error);
      toast({ variant: 'destructive', title: 'Gagal Menjalankan Analisis AI', description: (error as Error).message });
    } finally {
      setIsAiTaskLoading(false);
    }
  }, [toast, user, userProfile, salesTeam, customers]);

  const filteredCustomers = customers.filter(customer => {
    const searchMatch = dealsFilters.search.trim() === '' || customer.name.toLowerCase().includes(dealsFilters.search.toLowerCase()) || (customer.company || '').toLowerCase().includes(dealsFilters.search.toLowerCase()) || (customer.email || '').toLowerCase().includes(dealsFilters.search.toLowerCase());
    const salesMatch = dealsFilters.salesId === 'all' || customer.assignedSalesId === dealsFilters.salesId || (dealsFilters.salesId === 'unassigned' && !customer.assignedSalesId);
    let dateMatch = true;
    if (dealsFilters.dateRange?.from && dealsFilters.dateRange?.to) {
      const customerDate = new Date(customer.updatedAt);
      dateMatch = customerDate >= startOfDay(dealsFilters.dateRange.from) && customerDate <= endOfDay(dealsFilters.dateRange.to);
    }
    return searchMatch && salesMatch && dateMatch;
  });

  const refreshAllData = useCallback(() => {
    fetchFastData();
  }, [fetchFastData]);

  useEffect(() => {
    if (user && userProfile) {
      fetchFastData();
    }
  }, [user, userProfile, fetchFastData]);

  const handleAssignSalesToEntity = async (entityId: string, salesId: string, salesName: string, entityType: 'customer' | 'task') => {
    try {
      await assignSalesToEntity(entityId, salesId, salesName, entityType);
      toast({ title: 'Sukses', description: `Tugas/Pelanggan telah ditugaskan kepada ${salesName || 'Tidak Ditugaskan'}.` });
      refreshAllData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Menugaskan', description: (error as Error).message });
    }
  };

  const handleDeleteAnalyses = async (analysisIds: string[]) => {
    setIsDeletingAnalysis(true);
    try {
      await deleteAnalysis(analysisIds);
      toast({ title: 'Sukses', description: `${analysisIds.length} riwayat analisis berhasil dihapus.` });
      refreshAllData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Menghapus', description: (error as Error).message });
    } finally {
      setIsDeletingAnalysis(false);
    }
  }

  const handleAssignProspects = async (analysisId: string, prospects: ProspectData[], salesId: string, salesName: string) => {
    if (!user) return;
    try {
      const result = await assignProspects({ analysisId, prospects, salesId, salesName, leaderId: user.uid });
      toast({ title: 'Sukses!', description: `${result.count} prospek berhasil ditugaskan dan sekarang menjadi pelanggan.` });
      refreshAllData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Menugaskan', description: (error as Error).message });
    }
  }

  const handleStartAnalysis = async (input: Omit<WebinarAnalysisInput, 'rsvpData'>) => {
    setIsAnalysisLoading(true);
    try {
      const result = await analyzeWebinar(input);
      if (result.success) {
        refreshAllData();
        toast({ title: 'Analisis Dimulai', description: 'Data sedang diproses. Hasilnya akan segera muncul di tab Riwayat Analisis.', duration: 6000 });
      } else {
        toast({ variant: 'destructive', title: 'Analisis Gagal', description: result.error, duration: 8000 });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Analisis Gagal', description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui di sisi klien.' });
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  const handleGenerateTopics = async (analysisId: string) => {
    if (!analysisId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Analysis ID is missing.' });
      return;
    }
    setIsTopicLoading(analysisId);
    try {
      const result = await generateTopicRecommendationsForAnalysis(analysisId);
      if (result.success) {
        toast({ title: 'Sukses', description: 'Rekomendasi topik berhasil dibuat.' });
        setAnalysisHistory(prev => prev.map(item =>
          item.id === analysisId
            ? { ...item, topicsGenerated: true, analysis: { ...item.analysis, topicRecommendation: { recommendations: result.recommendations! } } }
            : item
        ));
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Membuat Rekomendasi', description: (error as Error).message });
    } finally {
      setIsTopicLoading(null);
    }
  };

  const handleGenerateInsights = async (analysisId: string) => {
    if (!analysisId) {
      toast({ variant: 'destructive', title: 'Error', description: 'Analysis ID is missing.' });
      return;
    }
    setIsInsightsLoading(analysisId);
    try {
      const result = await generateWebinarInsights(analysisId);
      if (result.success && result.insights) {
        toast({ title: 'Sukses', description: 'Ringkasan webinar berhasil dibuat oleh AI.' });
        const newInsights = result.insights;
        const updateState = (prev: AnalysisHistoryEntry[]): AnalysisHistoryEntry[] =>
          prev.map(item =>
            item.id === analysisId
              ? { ...item, insightsGenerated: true, analysis: { ...item.analysis, insights: newInsights } }
              : item
          );
        setAnalysisHistory(updateState);
      } else {
        throw new Error(result.error || "Gagal mendapatkan ringkasan dari AI.");
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Membuat Ringkasan', description: (error as Error).message });
    } finally {
      setIsInsightsLoading(null);
    }
  };

  const openCustomerEditDialog = (customer: Customer | null) => {
    setEditDialogState({ isOpen: true, customer });
  };

  const closeCustomerEditDialog = () => {
    setEditDialogState({ isOpen: false, customer: null });
  };

  const handleUpdateCustomer = async (customerData: any) => {
    if (!userProfile) {
      toast({ variant: 'destructive', title: 'Error', description: 'Profil pengguna tidak ditemukan.' });
      return;
    }
    try {
      await updateCustomer({ ...customerData, creatorTeam: userProfile.team });
      toast({ title: 'Sukses', description: `Pelanggan "${customerData.name}" berhasil diperbarui.` });
      refreshAllData();
      closeCustomerEditDialog();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Memperbarui Pelanggan', description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui.' });
      throw error;
    }
  };

  const handleCreateCustomer = async (customerData: any) => {
    if (!userProfile) {
      toast({ variant: 'destructive', title: 'Error', description: 'Profil pengguna tidak ditemukan.' });
      return;
    }
    try {
      await createManualCustomer({ ...customerData, creatorTeam: userProfile.team });
      toast({ title: 'Sukses', description: `Pelanggan "${customerData.name}" berhasil ditambahkan.` });
      refreshAllData();
      closeCustomerEditDialog();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Menambahkan Pelanggan', description: error instanceof Error ? error.message : 'Terjadi kesalahan tidak diketahui.' });
      throw error;
    }
  };

  const handleBulkDelete = async (customerIds: string[]) => {
    try {
      await Promise.all(customerIds.map(id => deleteCustomer(id)));
      toast({ title: 'Sukses', description: `${customerIds.length} pelanggan berhasil dihapus.` });
      refreshAllData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Hapus Massal', description: (error as Error).message });
      throw error;
    }
  };

  const handleBulkAssign = async (customerIds: string[], newSalesId: string) => {
    if (!newSalesId) {
      toast({ variant: 'destructive', title: 'Sales Tidak Dipilih', description: 'Pilih sales untuk ditugaskan.' });
      return;
    }
    const sales = salesTeam.find(s => s.id === newSalesId);
    if (!sales) {
      toast({ variant: 'destructive', title: 'Sales Tidak Valid' });
      return;
    }
    try {
      await Promise.all(customerIds.map(id => assignSalesToEntity(id, newSalesId, sales.name, 'customer')));
      toast({ title: 'Sukses', description: `${customerIds.length} deal berhasil ditugaskan ke ${sales.name}.` });
      refreshAllData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Gagal Menugaskan Massal', description: (error as Error).message });
    }
  };

  const value: DashboardContextType = {
    customers, filteredCustomers, salesTeam, tasks, analysisHistory, activityLogs,
    isLoading, isAiTaskLoading, isAnalysisLoading, isDeletingAnalysis, isTopicLoading, isInsightsLoading,
    refreshAllData, runAiTasks,
    handleAssignSalesToEntity, handleDeleteAnalyses, handleAssignProspects, handleStartAnalysis,
    handleGenerateTopics, handleGenerateInsights,
    editDialogState, openCustomerEditDialog, closeCustomerEditDialog, handleUpdateCustomer, handleCreateCustomer,
    dealsFilters, setDealsFilters, handleBulkDelete, handleBulkAssign, userProfile,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
