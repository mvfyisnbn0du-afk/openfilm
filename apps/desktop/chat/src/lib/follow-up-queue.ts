/** Pending messages of one project conversation. Claim before preparing anything: a render or a second click
 * must never dispatch the same message twice. Sending still belongs to the chat's existing turn runner. */
export class FollowUpQueue<T extends { id: string; steer?: boolean }> {
  private state: { items: T[]; claimed: string | null; held: string | null; paused: string | null; pauseVersion: number; suspended: boolean; uncertain: string[] } = {
    items: [], claimed: null, held: null, paused: null, pauseVersion: 0, suspended: false, uncertain: [],
  };
  private listeners = new Set<() => void>();
  get = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private change(next: Partial<typeof this.state>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
  add(item: T) { this.change({ items: [...this.state.items, structuredClone(item)] }); }
  move(id: string, targetId: string) {
    if (this.state.claimed || id === targetId) return;
    const items = [...this.state.items];
    const from = items.findIndex((item) => item.id === id);
    const to = items.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    this.change({ items });
  }
  remove(id: string) {
    if (this.state.claimed === id) return;
    this.change({ items: this.state.items.filter((item) => item.id !== id), uncertain: this.state.uncertain.filter((key) => key !== id) });
  }
  /** Return ownership to the composer, removing the message before another dispatch can claim it. */
  takeBack(id: string): T | null {
    if (this.state.claimed === id || this.state.uncertain.includes(id)) return null;
    const item = this.state.items.find((item) => item.id === id);
    if (!item) return null;
    this.change({ items: this.state.items.filter((item) => item.id !== id), held: null });
    return item;
  }
  hold(id: string | null) { this.change({ held: id }); }
  claim(id?: string): T | null {
    if (this.state.suspended || this.state.claimed || this.state.held || (!id && this.state.paused)) return null;
    const item = id ? this.state.items.find((item) => item.id === id) : this.state.items[0];
    if (!item || this.state.uncertain.includes(item.id)) return null;
    this.change({ claimed: item.id });
    return item;
  }
  complete(id: string) {
    if (this.state.claimed !== id) return;
    this.change({ claimed: null, items: this.state.items.filter((item) => item.id !== id) });
  }
  release(id: string, reason: string | null = this.state.paused, uncertain = false) {
    if (this.state.claimed !== id) return;
    this.change({ claimed: null, paused: reason, pauseVersion: this.state.pauseVersion + 1, ...(uncertain ? { uncertain: [...this.state.uncertain, id] } : {}) });
  }
  /** A definite refusal falls back to the next turn, rather than retrying the same steer forever. */
  defer(id: string) {
    if (this.state.claimed !== id) return;
    this.change({ claimed: null, items: this.state.items.map((item) => item.id === id ? { ...item, steer: false } : item) });
  }
  suspend(suspended: boolean) { this.change({ suspended }); }
  pause(reason: string) { if (!this.state.items.length) return; this.change({ paused: reason, pauseVersion: this.state.pauseVersion + 1 }); }
  resume() { this.change({ paused: null }); }
}
