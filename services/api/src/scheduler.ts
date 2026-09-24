export interface ScheduledJob {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

// Each loop schedules after completion: slow feeds cannot overlap themselves or block telemetry.
export function startScheduler(jobs: ScheduledJob[], onError: (name: string, error: unknown) => void) {
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const running = new Set<Promise<void>>();
  const launch = (job: ScheduledJob) => {
    const task = Promise.resolve()
      .then(job.run)
      .then(() => undefined)
      .catch((error) => onError(job.name, error))
      .finally(() => {
        running.delete(task);
        if (!stopped) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            launch(job);
          }, job.intervalMs);
          timers.add(timer);
        }
      });
    running.add(task);
  };
  for (const job of jobs) launch(job);
  return async () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    await Promise.allSettled([...running]);
  };
}
