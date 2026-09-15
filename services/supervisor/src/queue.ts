export interface Job<T> {
  name: string;
  data: T;
}

type Handler<T> = (job: Job<T>) => Promise<void>;

export class MemoryQueue {
  private readonly handlers = new Map<string, Handler<unknown>>();

  process<T>(name: string, handler: Handler<T>): void {
    this.handlers.set(name, handler as Handler<unknown>);
  }

  async add<T>(name: string, data: T): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler for ${name}`);
    await handler({ name, data });
  }
}

export function createCommandQueue() {
  if (process.env.REDIS_URL) {
    return new MemoryQueue();
  }
  return new MemoryQueue();
}
