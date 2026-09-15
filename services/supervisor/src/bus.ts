import { EventEmitter } from "node:events";
import type { SessionEvent } from "@atelier/contracts";

export type BusListener = (event: SessionEvent & { sessionId: string; workspaceId: string }) => void;

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  publish(event: SessionEvent & { sessionId: string; workspaceId: string }): void {
    this.emitter.emit("session", event);
    this.emitter.emit(`session:${event.sessionId}`, event);
    this.emitter.emit(`workspace:${event.workspaceId}`, event);
  }

  subscribe(sessionId: string, listener: BusListener): () => void {
    this.emitter.on(`session:${sessionId}`, listener);
    return () => this.emitter.off(`session:${sessionId}`, listener);
  }

  subscribeWorkspace(workspaceId: string, listener: BusListener): () => void {
    this.emitter.on(`workspace:${workspaceId}`, listener);
    return () => this.emitter.off(`workspace:${workspaceId}`, listener);
  }
}

export const bus = new EventBus();
