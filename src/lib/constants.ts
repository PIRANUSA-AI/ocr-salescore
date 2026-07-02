import { BarChart3, Sparkles, Bot, Kanban, Users, ListChecks, Building2, ImageIcon, Settings, Send } from 'lucide-react';

// --- MENU DEFINITIONS ---

export const baseLeaderMenuItems = [
  { id: 'report', label: 'Laporan', icon: BarChart3, description: 'Analisis kinerja tim dan kesehatan bisnis.' },
  { id: 'analysis', label: 'Webinar', icon: Sparkles, description: 'Jalankan analisis AI pada data webinar dan kelola prospek.' },
  { id: 'sales-assistant', label: 'Reply Assistant', icon: Bot, description: 'Gunakan AI untuk membantu membuat balasan dan mengelola pelanggan.' },
  { id: 'deals', label: 'Deals', icon: Kanban, description: 'Visualisasikan dan kelola pipeline penjualan Anda dalam tampilan kanban.' },
  { id: 'customer-manager', label: 'Customers', icon: Users, description: 'Kelola semua data pelanggan Anda.' },
  // Task-to-Do (MySQL-backed) dinonaktifkan — app fully Firebase, fitur ini tidak dipakai. Jangan dihapus.
  // { id: 'to-do', label: 'Task to Do', icon: ListChecks, description: 'Kelola daftar tugas dan tugaskan pekerjaan ke sales.' },
  { id: 'company', label: 'Company', icon: Building2, description: 'Kelola data pelanggan berbasis perusahaan.' },
  { id: 'media-library', label: 'Media Library', icon: ImageIcon, description: 'Kelola aset gambar untuk email dan kampanye.' },
  { id: 'email-blast', label: 'Email Blast', icon: Send, description: 'Kirim email blast ke pelanggan.' },
];

export const baseSalesMenuItems = [
  { id: 'sales-assistant', label: 'Reply Assistant', icon: Bot, description: 'Gunakan AI untuk membantu membuat balasan dari screenshot atau teks.' },
  { id: 'deals', label: 'Deals', icon: Kanban, description: 'Visualisasikan dan kelola pipeline penjualan Anda dalam tampilan kanban.' },
  { id: 'my-customers', label: 'Customers', icon: Users, description: 'Lihat, tambah, dan kelola semua pelanggan yang ditugaskan kepada Anda.' },
  // Task-to-Do (MySQL-backed) dinonaktifkan — app fully Firebase, fitur ini tidak dipakai. Jangan dihapus.
  // { id: 'to-do', label: 'Task to Do', icon: ListChecks, description: 'Daftar tugas Anda, termasuk yang ditugaskan oleh leader.' },
  { id: 'company', label: 'Company', icon: Building2, description: 'Kelola data pelanggan berbasis perusahaan.' },
  { id: 'media-library', label: 'Media Library', icon: ImageIcon, description: 'Kelola aset gambar untuk email dan kampanye.' },
  { id: 'email-blast', label: 'Email Blast', icon: Send, description: 'Kirim email blast ke pelanggan.' },
];

export const superadminMenuItems = [
  { id: 'report', label: 'Laporan Global', icon: BarChart3, description: 'Pantau kinerja semua tim dan divisi.' },
  { id: 'features', label: 'Manajemen Fitur', icon: Settings, description: 'Aktifkan atau nonaktifkan fitur untuk semua pengguna.' },
  { id: 'users', label: 'Manajemen User', icon: Users, description: 'Kelola akun Leader dan Sales.' },
  { id: 'customers', label: 'Semua Pelanggan', icon: Users, description: 'Tinjau semua pelanggan dari seluruh tim sales.' },
];
