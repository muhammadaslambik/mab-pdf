export const spawnCompressWorker = (): Worker =>
  new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
