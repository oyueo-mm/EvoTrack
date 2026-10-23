export class Random {
  constructor(public state = 42) {
    this.state = state >>> 0;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    this.state >>>= 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
  normal() {
    return (
      Math.sqrt(-2 * Math.log(Math.max(1e-12, this.next()))) *
      Math.cos(2 * Math.PI * this.next())
    );
  }
}
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
