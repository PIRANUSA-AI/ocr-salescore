'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  getMyTasks,
  createTask,
  toggleTaskStatus,
  deleteTask,
  getAssignableMembers,
} from '@/app/actions/task-todo';
import type { UserTask, TeamMember } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, ListChecks, UserCheck } from 'lucide-react';

const priorityStyle: Record<UserTask['priority'], string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const sourceLabel: Record<UserTask['source'], string> = {
  leader: 'Dari Leader',
  ai: 'Dari AI',
  self: 'Pribadi',
};

export function TodoManager() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const isLeader = userProfile?.role === 'Leader' || userProfile?.role === 'Superadmin';

  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<UserTask['priority']>('medium');
  const [dueDate, setDueDate] = useState('');
  // leader-only: which sales rep to assign to (empty = assign to self)
  const [assignTo, setAssignTo] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // A leader assigning to a rep still tracks their own list; here we show
      // the current user's tasks. The assign target only changes who OWNS a new task.
      const [taskList, memberList] = await Promise.all([
        getMyTasks(user.uid),
        isLeader ? getAssignableMembers() : Promise.resolve([]),
      ]);
      setTasks(taskList);
      setMembers(memberList);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Gagal memuat tugas',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan.',
      });
    } finally {
      setLoading(false);
    }
  }, [user, isLeader, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = () => {
    if (!user || !userProfile) return;
    if (!title.trim()) {
      toast({ variant: 'destructive', title: 'Judul tugas wajib diisi.' });
      return;
    }

    // Determine owner: leader can assign to a rep, otherwise task is self-owned.
    const target = isLeader && assignTo ? members.find((m) => m.id === assignTo) : null;
    const ownerId = target ? target.id : user.uid;
    const ownerName = target ? target.name : userProfile.name;

    startTransition(async () => {
      try {
        await createTask({
          userId: ownerId,
          userName: ownerName,
          title,
          description,
          priority,
          dueDate: dueDate || null,
          source: target ? 'leader' : 'self',
          assignedById: target ? user.uid : null,
          assignedByName: target ? userProfile.name : null,
        });
        setTitle('');
        setDescription('');
        setPriority('medium');
        setDueDate('');
        setAssignTo('');
        toast({
          title: 'Tugas ditambahkan',
          description: target ? `Ditugaskan ke ${target.name}.` : 'Masuk ke daftar tugas Anda.',
        });
        await load();
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'Gagal menambah tugas',
          description: e instanceof Error ? e.message : 'Terjadi kesalahan.',
        });
      }
    });
  };

  const handleToggle = (task: UserTask) => {
    if (!user) return;
    const next = task.status === 'done' ? 'todo' : 'done';
    // optimistic update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    startTransition(async () => {
      try {
        await toggleTaskStatus(task.id, user.uid, next);
      } catch {
        await load(); // revert on failure
      }
    });
  };

  const handleDelete = (task: UserTask) => {
    if (!user) return;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    startTransition(async () => {
      try {
        await deleteTask(task.id, user.uid);
      } catch {
        await load();
      }
    });
  };

  const openTasks = tasks.filter((t) => t.status === 'todo');
  const doneTasks = tasks.filter((t) => t.status === 'done');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ListChecks className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Task to Do</h1>
      </div>

      {/* Add task form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tambah Tugas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="task-title">Judul</Label>
            <Input
              id="task-title"
              placeholder="Contoh: Follow-up lead pameran"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-desc">Deskripsi (opsional)</Label>
            <Textarea
              id="task-desc"
              placeholder="Detail tugas..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Prioritas</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as UserTask['priority'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="task-due">Jatuh tempo</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            {isLeader && (
              <div className="grid gap-2">
                <Label>Tugaskan ke</Label>
                <Select value={assignTo} onValueChange={setAssignTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Diri sendiri" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.salesCode ? `(${m.salesCode})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <Button onClick={handleAdd} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Tambah Tugas
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat tugas...
        </div>
      ) : (
        <div className="space-y-6">
          <TaskSection
            heading={`Belum Selesai (${openTasks.length})`}
            tasks={openTasks}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
          {doneTasks.length > 0 && (
            <TaskSection
              heading={`Selesai (${doneTasks.length})`}
              tasks={doneTasks}
              onToggle={handleToggle}
              onDelete={handleDelete}
              muted
            />
          )}
          {tasks.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Belum ada tugas. Tambahkan tugas pertama Anda di atas.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TaskSection({
  heading,
  tasks,
  onToggle,
  onDelete,
  muted,
}: {
  heading: string;
  tasks: UserTask[];
  onToggle: (t: UserTask) => void;
  onDelete: (t: UserTask) => void;
  muted?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{heading}</h2>
      {tasks.map((task) => (
        <Card key={task.id} className={muted ? 'opacity-60' : ''}>
          <CardContent className="flex items-start gap-3 py-4">
            <Checkbox
              checked={task.status === 'done'}
              onCheckedChange={() => onToggle(task)}
              className="mt-1"
            />
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-medium ${task.status === 'done' ? 'line-through' : ''}`}>
                  {task.title}
                </span>
                <Badge variant="outline" className={priorityStyle[task.priority]}>
                  {task.priority}
                </Badge>
                {task.source !== 'self' && (
                  <Badge variant="secondary" className="gap-1">
                    <UserCheck className="h-3 w-3" />
                    {sourceLabel[task.source]}
                    {task.assignedByName ? `: ${task.assignedByName}` : ''}
                  </Badge>
                )}
              </div>
              {task.description && (
                <p className="text-sm text-muted-foreground">{task.description}</p>
              )}
              {task.dueDate && (
                <p className="text-xs text-muted-foreground">Jatuh tempo: {task.dueDate}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(task)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
