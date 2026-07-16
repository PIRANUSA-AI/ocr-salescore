import { createOcrWorker, closeOcrQueue } from './lib/ocr-queue.js';
import { executeOcrPipeline } from './services/ocr-service.js';

async function main() {
  const worker = createOcrWorker(executeOcrPipeline);
  console.log('[ocr-worker] listening for OCR jobs...');

  process.on('SIGTERM', async () => {
    console.log('[ocr-worker] SIGTERM received, shutting down gracefully...');
    await worker.close();
    await closeOcrQueue();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[ocr-worker] SIGINT received, shutting down...');
    await worker.close();
    await closeOcrQueue();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    console.error('[ocr-worker] uncaught exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[ocr-worker] unhandled rejection:', reason);
  });
}

main().catch((err) => {
  console.error('[ocr-worker] fatal:', err);
  process.exit(1);
});
