"use node";
import algoliasearch from "algoliasearch";

export const ALGOLIA_APP_ID = "1KIE511890";

export class ConcurrencyLimiter<T> {
  limit: number;
  current: number;
  waiters: ((_v: any) => void)[];
  constructor(limit: number) {
    this.limit = limit;
    this.current = 0;
    this.waiters = [];
  }
  async add(fn: () => Promise<T>): Promise<T> {
    while (true) {
      if (this.current < this.limit) {
        this.current += 1;
        return fn().finally(() => {
          this.next();
        });
      }
      const p = new Promise(resolve => {
        this.waiters.push(resolve);
      });
      await p;
    }
  }
  next() {
    this.current -= 1;
    const runNow = this.waiters.pop();
    if (runNow) {
      runNow(null);
    }
  }
}

export function getAlgolia() {
  return algoliasearch(ALGOLIA_APP_ID, process.env.ALGOLIA_API_KEY!);
}
