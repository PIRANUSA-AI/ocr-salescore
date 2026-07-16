import Redis from 'ioredis';
import { Queue, Worker, type QueueOptions, type WorkerOptions } from 'bullmq';
import { config } from '../config.js';

interface OcrJobData {
  jobId: string;
  userId: string;
  team: 'AEC' | 'MFG';
  imageUrl: string;
}

type OcrPipelineFn = (jobId: string, team: 'AEC' | 'MFG') => Promise<void>;

let connection: Redis | undefined;
let queue: Queue<OcrJobData> | undefined;
let worker: Worker<OcrJobData> | undefined;

function getConnection(): Redis {
  if (connection) return connection;
  connection = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  connection.on('error', (e) => console.error('[ocr-queue:redis] error:', e.message));
  return connection;
}

export function getOcrQueue(): Queue<OcrJobData> {
  if (queue) return queue;
  const opts: QueueOptions = {
    connection: getConnection() as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    },
  };
  queue = new Queue<OcrJobData>('ocr', opts);
  return queue;
}

export async function enqueueOcr(data: OcrJobData): Promise<string> {
  const q = getOcrQueue();
  const job = await q.add('process', data, {
    jobId: data.jobId,
  });
  return job.id ?? '';
}

export function createOcrWorker(
  pipeline: OcrPipelineFn,
): Worker<OcrJobData> {
  if (worker) return worker;

  const opts: WorkerOptions = {
    connection: getConnection() as any,
    concurrency: 1,
    lockDuration: 60000,
    stalledInterval: 30000,
    maxStalledCount: 2,
  };

  worker = new Worker<OcrJobData>(
    'ocr',
    async (job) => {
      const { jobId, team } = job.data;
      console.log(`[ocr-worker] start job ${jobId} (${team})`);
      await pipeline(jobId, team);
      console.log(`[ocr-worker] done job ${jobId}`);
    },
    opts,
  );

  worker.on('failed', (job, err) => {
    console.error(`[ocr-worker] job ${job?.data.jobId} failed:`, err.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[ocr-worker] job ${jobId} stalled — will be retried`);
  });

  return worker;
}

export async function closeOcrQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
  await connection?.quit();
  worker = undefined;
  queue = undefined;
  connection = undefined;
}
