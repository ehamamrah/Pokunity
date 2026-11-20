/**
 * Client-side write limiter. When the server answers 429 with Retry-After, further writes are
 * held locally until the window passes, so a burst of clicks does not turn into a burst of
 * rejected requests. Reads are not gated.
 */
export class RateGate {
  private openAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  close(seconds: number): void {
    this.openAt = Math.max(this.openAt, this.now() + seconds * 1000);
  }

  remainingSeconds(): number {
    return Math.max(0, Math.ceil((this.openAt - this.now()) / 1000));
  }
}

export const writeGate = new RateGate();
