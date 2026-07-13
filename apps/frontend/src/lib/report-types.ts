export type OcrTimeRange = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';
export type OcrTeamFilter = 'AEC' | 'MFG' | 'all';

export interface OcrSalesRow {
  salesId: string | null;
  salesName: string;
  total: number;
  newToday: number;
  won: number;
  conversionRate: number;
  potentialRevenue: number;
}

export interface OcrFunnelStage {
  status: string;
  count: number;
}

export interface OcrQualityReport {
  total: number;
  noEmail: number;
  noPhone: number;
  invalidEmail: number;
}

export interface OcrReportData {
  stats: {
    totalOcr: number;
    newToday: number;
    unassigned: number;
    won: number;
    conversionRate: number;
  };
  perSales: OcrSalesRow[];
  funnel: OcrFunnelStage[];
  quality: OcrQualityReport;
}

export interface CustomerExportRow {
  Nama: string;
  Email: string;
  Telepon: string;
  Perusahaan: string;
  Jabatan: string;
  Tim: string;
  'Pipeline Status': string;
  Sales: string;
  'Kode Sales': string;
  'Potensi Revenue': number;
  Produk: string;
  Sumber: string;
  Dibuat: string;
  Diupdate: string;
}

export interface PipelineReportData {
  generatedAt: string;
  team: string;
  summary: {
    totalCustomers: number;
    totalValue: number;
    wonDeals: number;
    wonValue: number;
    conversionRate: string;
  };
  pipelineBreakdown: Record<string, { count: number; value: number; customers: string[] }>;
}
