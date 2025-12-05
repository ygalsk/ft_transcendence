export class SingleSlotQueue<T> {
  private waiting: T | null = null;

  matchOrWait(entry: T): T | null {
    if (!this.waiting) {
      this.waiting = entry;
      return null;
    }

    const opponent = this.waiting;
    this.waiting = null;
    return opponent;
  }

  clearIf(predicate: (entry: T) => boolean): void {
    if (this.waiting && predicate(this.waiting)) {
      this.waiting = null;
    }
  }

  peek(): T | null {
    return this.waiting;
  }
}
