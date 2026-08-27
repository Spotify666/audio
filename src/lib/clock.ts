/**
 * A one-object playback clock. Canvases read it inside their own rAF loop so a
 * moving playhead never triggers a React render; only the word caption
 * subscribes, and only when the word under the playhead actually changes.
 */
export class Clock {
  time = 0
  duration = 0
  playing = false
  private listeners = new Set<() => void>()

  set(time: number, duration: number, playing: boolean) {
    const changed = this.playing !== playing
    this.time = time
    this.duration = duration
    this.playing = playing
    if (changed) this.emit()
  }

  /** Force subscribers to re-read (used when the shape or slots change). */
  emit() {
    for (const l of this.listeners) l()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  get progress() {
    return this.duration > 0 ? Math.min(1, this.time / this.duration) : 0
  }
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
