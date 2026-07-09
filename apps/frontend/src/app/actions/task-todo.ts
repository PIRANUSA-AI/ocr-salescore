// src/app/actions/task-todo.ts
'use server';

import { revalidatePath } from 'next/cache';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/mysql';
import { cacheGet, cacheDel, taskCacheKey } from '@/lib/redis';
import type { UserTask, TeamMember } from '@/types';

// -------- row mappers (snake_case DB -> camelCase app) --------

interface TaskRow extends RowDataPacket {
  id: number;
  user_id: string;
  user_name: string;
  title: string;
  description: string | null;
  status: 'todo' | 'done';
  priority: 'low' | 'medium' | 'high';
  source: 'self' | 'leader' | 'ai';
  assigned_by_id: string | null;
  assigned_by_name: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow extends RowDataPacket {
  id: string;
  name: string;
  email: string | null;
  role: 'Leader' | 'Sales' | 'Superadmin';
  team: 'AEC' | 'MFG';
  sales_code: string | null;
  leader_id: string | null;
}

function mapTask(r: TaskRow): UserTask {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    source: r.source,
    assignedById: r.assigned_by_id,
    assignedByName: r.assigned_by_name,
    dueDate: r.due_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// -------- reads (cache-aside via Redis) --------

/** Tasks for one sales rep. Ordered: open first, then priority, then due date. */
export async function getMyTasks(userId: string): Promise<UserTask[]> {
  if (!userId) return [];
  return cacheGet(taskCacheKey(userId), async () => {
    const rows = await query<TaskRow[]>(
      `SELECT * FROM user_tasks
       WHERE user_id = ?
       ORDER BY (status = 'done') ASC,
                FIELD(priority, 'high', 'medium', 'low') ASC,
                (due_date IS NULL) ASC, due_date ASC,
                created_at DESC`,
      [userId]
    );
    return rows.map(mapTask);
  });
}

/** Sales reps a leader can assign tasks to. */
export async function getAssignableMembers(): Promise<TeamMember[]> {
  const rows = await query<MemberRow[]>(
    `SELECT * FROM team_members WHERE role = 'Sales' ORDER BY name ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    team: r.team,
    salesCode: r.sales_code,
    leaderId: r.leader_id,
  }));
}

// -------- writes (invalidate cache after) --------

export interface CreateTaskInput {
  userId: string;
  userName: string;
  title: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string | null; // YYYY-MM-DD
  source?: 'self' | 'leader' | 'ai';
  assignedById?: string | null;
  assignedByName?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<{ id: number }> {
  const title = input.title?.trim();
  if (!title) throw new Error('Judul tugas wajib diisi.');

  const res = await query<ResultSetHeader>(
    `INSERT INTO user_tasks
       (user_id, user_name, title, description, priority, source, assigned_by_id, assigned_by_name, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.userName,
      title,
      input.description?.trim() || null,
      input.priority || 'medium',
      input.source || 'self',
      input.assignedById || null,
      input.assignedByName || null,
      input.dueDate || null,
    ]
  );

  await cacheDel(taskCacheKey(input.userId));
  revalidatePath('/dashboard');
  return { id: res.insertId };
}

export async function toggleTaskStatus(
  taskId: number,
  userId: string,
  status: 'todo' | 'done'
): Promise<void> {
  // user_id in WHERE so a rep can only flip their own tasks.
  await query<ResultSetHeader>(
    `UPDATE user_tasks SET status = ? WHERE id = ? AND user_id = ?`,
    [status, taskId, userId]
  );
  await cacheDel(taskCacheKey(userId));
  revalidatePath('/dashboard');
}

export async function deleteTask(taskId: number, userId: string): Promise<void> {
  await query<ResultSetHeader>(
    `DELETE FROM user_tasks WHERE id = ? AND user_id = ?`,
    [taskId, userId]
  );
  await cacheDel(taskCacheKey(userId));
  revalidatePath('/dashboard');
}
