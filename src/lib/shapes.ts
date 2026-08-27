import { COLUMNS } from './envelope'

export interface Preset {
  id: string
  name: string
  blurb: string
  build: (n?: number) => number[]
}

const build = (n: number, fn: (t: number, i: number) => number) =>
  Array.from({ length: n }, (_, i) => Math.round(Math.max(0, Math.min(100, fn(i / (n - 1), i)))))

export const PRESETS: Preset[] = [
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    blurb: 'Two spikes, long rest. Survives WhatsApp’s normalisation better than any letter.',
    build: (n = COLUMNS) =>
      build(n, (_, i) => {
        const beat = i % 16
        if (beat === 2) return 55
        if (beat === 3) return 100
        if (beat === 4) return 30
        if (beat === 6) return 70
        if (beat === 7) return 45
        return 10
      }),
  },
  {
    id: 'sine',
    name: 'Sine',
    blurb: 'Three cycles. The calmest thing to listen to — gain moves smoothly.',
    build: (n = COLUMNS) => build(n, (t) => 50 + 48 * Math.sin(t * Math.PI * 6)),
  },
  {
    id: 'sawtooth',
    name: 'Sawtooth',
    blurb: 'Four ramps with a hard reset. Reads as deliberate at a glance.',
    build: (n = COLUMNS) => build(n, (t) => 8 + 92 * ((t * 4) % 1)),
  },
  {
    id: 'staircase',
    name: 'Staircase',
    blurb: 'Eight flat steps. Quantised on purpose — nothing here is accidental.',
    build: (n = COLUMNS) => build(n, (t) => 10 + 90 * (Math.floor(t * 8) / 7)),
  },
  {
    id: 'pulse',
    name: 'Pulse train',
    blurb: 'On for two columns, off for two. The harshest to listen to.',
    build: (n = COLUMNS) => build(n, (_, i) => (Math.floor(i / 2) % 2 === 0 ? 100 : 8)),
  },
  {
    id: 'crescendo',
    name: 'Crescendo',
    blurb: 'A single rise across the whole clip. Barely alters how the audio sounds.',
    build: (n = COLUMNS) => build(n, (t) => 6 + 94 * t * t),
  },
  {
    id: 'peak',
    name: 'Centre peak',
    blurb: 'One mountain. The most reliably recognisable shape in the set.',
    build: (n = COLUMNS) => build(n, (t) => 6 + 94 * Math.exp(-Math.pow((t - 0.5) / 0.16, 2))),
  },
]

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0]
