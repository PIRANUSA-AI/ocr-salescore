'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, RefreshCw, MoreVertical, Edit2, Trash2, KeyRound } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FadeIn } from "@/components/ui/fade-in";
import { api } from '@/lib/api-client';
import type { UserProfile } from '@/types';

export function UserManager() {
    const { toast } = useToast();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Dialog States
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isPasswordOpen, setIsPasswordOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    // Form States
    const [formData, setFormData] = useState<{ name: string; email: string; password: string; role: string; team: string }>({
        name: '',
        email: '',
        password: '',
        role: 'Sales',
        team: 'AEC'
    });

    const [passwordData, setPasswordData] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setIsLoading(true);
        try {
            const data = await api.users.list().then(r => r.users);
            setUsers(data);
        } catch (error) {
            toast({
                title: "Gagal memuat data",
                description: "Terjadi kesalahan saat mengambil daftar pengguna.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateUser = async () => {
        if (!formData.name || !formData.email || !formData.password) {
            toast({ title: "Validasi Gagal", description: "Mohon lengkapi semua field.", variant: "destructive" });
            return;
        }

        setIsActionLoading(true);
        try {
            await api.users.create(formData);
            toast({ title: "Sukses", description: "Pengguna berhasil dibuat." });
            setIsCreateOpen(false);
            setFormData({ name: '', email: '', password: '', role: 'Sales', team: 'AEC' }); // Reset
            loadUsers();
        } catch (error: any) {
            toast({ title: "Gagal", description: error.message, variant: "destructive" });
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleUpdateUser = async () => {
        if (!selectedUser || !formData.name) return;

        setIsActionLoading(true);
        try {
            await api.users.update(selectedUser.uid, {
                uid: selectedUser.uid,
                name: formData.name,
                role: formData.role,
                team: formData.team
            });
            toast({ title: "Sukses", description: "Data pengguna diperbarui." });
            setIsEditOpen(false);
            loadUsers();
        } catch (error: any) {
            toast({ title: "Gagal", description: error.message, variant: "destructive" });
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteUser = async (user: UserProfile) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus pengguna ${user.name}? Tindakan ini tidak dapat dibatalkan.`)) return;

        setIsActionLoading(true);
        try {
            await api.users.delete(user.uid);
            toast({ title: "Sukses", description: "Pengguna dihapus." });
            loadUsers();
        } catch (error: any) {
            toast({ title: "Gagal", description: error.message, variant: "destructive" });
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!selectedUser || !passwordData) return;
        setIsActionLoading(true);
        try {
            await api.users.updatePassword(selectedUser.uid, passwordData);
            toast({ title: "Sukses", description: "Password berhasil di-reset." });
            setIsPasswordOpen(false);
            setPasswordData('');
        } catch (error: any) {
            toast({ title: "Gagal", description: error.message, variant: "destructive" });
        } finally {
            setIsActionLoading(false);
        }
    }

    const openEditDialog = (user: UserProfile) => {
        setSelectedUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: '', // Not used for update
            role: user.role,
            team: user.team
        });
        setIsEditOpen(true);
    };

    const openPasswordDialog = (user: UserProfile) => {
        setSelectedUser(user);
        setPasswordData('');
        setIsPasswordOpen(true);
    }

    return (
        <FadeIn>
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl font-bold font-headline">Manajemen Pengguna</CardTitle>
                            <CardDescription>Kelola akun tim Sales dan Leader.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={loadUsers} disabled={isLoading}>
                                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button onClick={() => setIsCreateOpen(true)}>
                                <UserPlus className="mr-2 h-4 w-4" /> Tambah User
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nama</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Tim</TableHead>
                                        <TableHead className="w-[100px]">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <div className="flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                            </TableCell>
                                        </TableRow>
                                    ) : users.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                Belum ada pengguna. Tambahkan pengguna baru.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        users.map((user) => (
                                            <TableRow key={user.uid}>
                                                <TableCell className="font-medium">{user.name}</TableCell>
                                                <TableCell>{user.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant={user.role === 'Superadmin' ? 'destructive' : user.role === 'Leader' ? 'default' : 'secondary'}>
                                                        {user.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{user.team}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                                                <Edit2 className="mr-2 h-4 w-4" /> Edit Detail
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => openPasswordDialog(user)}>
                                                                <KeyRound className="mr-2 h-4 w-4" /> Reset Password
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleDeleteUser(user)} className="text-red-600 focus:text-red-600">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Hapus User
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* CREATE DIALOG */}
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Tambah Pengguna Baru</DialogTitle>
                            <DialogDescription>Buat akun baru untuk tim Anda.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nama Lengkap</Label>
                                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">Password (Default)</Label>
                                <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Role</Label>
                                    <Select value={formData.role} onValueChange={(val: any) => setFormData({ ...formData, role: val })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Sales">Sales</SelectItem>
                                            <SelectItem value="Leader">Leader</SelectItem>
                                            <SelectItem value="Superadmin">Superadmin</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Tim</Label>
                                    <Select value={formData.team} onValueChange={(val: any) => setFormData({ ...formData, team: val })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="AEC">AEC</SelectItem>
                                            <SelectItem value="MFG">MFG</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
                            <Button onClick={handleCreateUser} disabled={isActionLoading}>
                                {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Simpan
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* EDIT DIALOG */}
                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit Pengguna</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-name">Nama Lengkap</Label>
                                <Input id="edit-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-email">Email (Read Only)</Label>
                                <Input id="edit-email" value={formData.email} disabled />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>Role</Label>
                                    <Select value={formData.role} onValueChange={(val: any) => setFormData({ ...formData, role: val })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Sales">Sales</SelectItem>
                                            <SelectItem value="Leader">Leader</SelectItem>
                                            <SelectItem value="Superadmin">Superadmin</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>Tim</Label>
                                    <Select value={formData.team} onValueChange={(val: any) => setFormData({ ...formData, team: val })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="AEC">AEC</SelectItem>
                                            <SelectItem value="MFG">MFG</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
                            <Button onClick={handleUpdateUser} disabled={isActionLoading}>
                                {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* RESET PASSWORD DIALOG */}
                <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reset Password</DialogTitle>
                            <DialogDescription>Masukkan password baru untuk {selectedUser?.name}.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="new-password">Password Baru</Label>
                                <Input id="new-password" type="password" value={passwordData} onChange={(e) => setPasswordData(e.target.value)} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsPasswordOpen(false)}>Batal</Button>
                            <Button onClick={handleResetPassword} disabled={isActionLoading || !passwordData}>
                                {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reset Password
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </FadeIn>
    );
}

// Export default for dynamic imports if needed
export default UserManager;
