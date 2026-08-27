import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COLUMNS, COMFORTABLE, renderWord, weakCharacters } from './lib/word'
import { glyphFor } from './lib/glyphs'
import { VOICES, measureBars, synthesise, SAMPLE_RATE } from './lib/synth'
import type { Voice } from './lib/synth'
import { download, encodeOpus, encodeWav, formatTime } from './lib/opus'
import { VoiceNote } from './components/VoiceNote'
import { Logo } from './components/Logo'

const MAX_CHARS = 6

export default function App() {
  const [word, setWord] = useState('O')
  const [voice, setVoice] = useState<Voice>('hum')
  const [seconds, setSeconds] = useState(12)
  const [scale, setScale] = useState(2)

  const [audio, setAudio] = useState<{ url: string; bars: number[]; samples: Float32Array } | null>(null)
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState<'ogg' | 'wav' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const el = useRef<HTMLAudioElement>(null)
  const raf = useRef(0)

  const shape = useMemo(() => renderWord(word), [word])
  const weak = useMemo(() => weakCharacters(word), [word])
  const chars = shape.chars

  // Rebuild the clip whenever the shape or the sound changes.
  useEffect(() => {
    const id = setTimeout(() => {
      const samples = synthesise({ levels: shape.columns, voice, seconds })
      const blob = encodeWav(samples, SAMPLE_RATE)
      const url = URL.createObjectURL(blob)
      setAudio((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url, bars: measureBars(samples), samples }
      })
    }, 160)
    return () => clearTimeout(id)
  }, [shape, voice, seconds])

  useEffect(() => () => setAudio((p) => (p && URL.revokeObjectURL(p.url), null)), [])

  useEffect(() => {
    const node = el.current
    if (!node || !audio) return
    const wasPlaying = !node.paused
    node.src = audio.url
    node.load()
    setProgress(0)
    if (wasPlaying) void node.play().catch(() => setPlaying(false))
  }, [audio])

  useEffect(() => {
    const loop = () => {
      const node = el.current
      if (node && node.duration) setProgress(node.currentTime / node.duration)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const toggle = useCallback(() => {
    const node = el.current
    if (!node) return
    if (node.paused) void node.play().catch(() => setPlaying(false))
    else node.pause()
  }, [])

  const name = (chars.join('') || 'shape').toLowerCase()

  const save = async (kind: 'ogg' | 'wav') => {
    if (!audio) return
    setError(null)
    setSaving(kind)
    try {
      if (kind === 'wav') download(encodeWav(audio.samples, SAMPLE_RATE), `${name}.wav`)
      else {
        const { blob } = await encodeOpus(audio.samples, SAMPLE_RATE)
        download(blob, `${name}.ogg`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the file.')
    } finally {
      setSaving(null)
    }
  }

  const tooMany = chars.length > COMFORTABLE
  const rating = chars.length === 1 ? glyphFor(chars[0]).legibility : null

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-8 px-5 py-8">
      <audio
        ref={el}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />

      <header className="flex items-center gap-2.5">
        <Logo />
        <span className="u-display text-[15px] tracking-tight">Waveprint</span>
      </header>

      <main className="flex flex-col gap-8">
        {/* The preview is the product: this is the message, at the size it arrives. */}
        <section className="flex flex-col items-center gap-4">
          {/* safe centring: centres while it fits, aligns left once it overflows,
              so a zoomed bubble scrolls instead of having both ends clipped. */}
          <div
            className="flex w-full overflow-x-auto rounded-lg bg-[#0B141A] px-4 py-7"
            style={{ justifyContent: 'safe center' }}
          >
            <VoiceNote
              bars={audio?.bars ?? shape.columns}
              duration={seconds}
              progress={progress}
              playing={playing}
              onToggle={toggle}
              scale={scale}
            />
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Preview size">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scale === s}
                onClick={() => setScale(s)}
                className={`u-data border px-2.5 py-1 text-[11px] transition-colors ${
                  scale === s ? 'border-signal text-signal' : 'border-line/50 text-bone/40 hover:text-bone/70'
                }`}
              >
                {s}×
              </button>
            ))}
            <span className="u-data ml-2 text-[10px] text-bone/30">
              {scale === 1 ? 'actual size' : 'zoomed'}
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <label htmlFor="word" className="u-label">
            Letter
          </label>
          <input
            id="word"
            value={word}
            onChange={(e) => setWord(e.target.value.replace(/\s+/g, '').slice(0, MAX_CHARS))}
            autoComplete="off"
            spellCheck={false}
            placeholder="O"
            className="u-display w-full border-b-2 border-line/60 bg-transparent pb-2 text-center text-6xl uppercase tracking-[0.08em] text-bone caret-signal outline-none placeholder:text-line focus:border-signal"
          />
          <p className="u-data flex items-center justify-center gap-2 text-[11px]">
            {chars.length === 0 ? (
              <span className="text-bone/30">type a letter</span>
            ) : (
              <>
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{
                    background:
                      tooMany || weak.length ? '#FF7A45' : rating === 'strong' ? '#7FD1A8' : '#9AA7BD',
                  }}
                />
                <span className={tooMany || weak.length ? 'text-signal' : 'text-bone/45'}>
                  {tooMany
                    ? `${chars.length} letters share 64 bars — too narrow to read`
                    : weak.length
                      ? `${weak.join(', ')} ${weak.length > 1 ? 'do not' : 'does not'} read as bars`
                      : `${shape.perChar} of ${COLUMNS} bars per letter`}
                </span>
              </>
            )}
          </p>
        </section>

        <section className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="u-label">Sound</span>
            <div className="flex gap-1">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={voice === v.id}
                  onClick={() => setVoice(v.id)}
                  className={`u-data flex-1 border px-2 py-2 text-[11px] transition-colors ${
                    voice === v.id
                      ? 'border-signal bg-signal text-ink'
                      : 'border-line/50 text-bone/55 hover:border-signal/60 hover:text-bone'
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="len" className="u-label">
                Length
              </label>
              <output htmlFor="len" className="u-data text-[11px] text-signal">
                {formatTime(seconds)}
              </output>
            </div>
            <input
              id="len"
              type="range"
              min={4}
              max={40}
              step={1}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <button
            type="button"
            disabled={!audio || saving !== null}
            onClick={() => void save('ogg')}
            className="u-display w-full bg-signal px-6 py-4 text-lg text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving === 'ogg' ? 'Encoding…' : 'Download voice note'}
          </button>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] leading-snug text-bone/45">
              Attach the .ogg in WhatsApp. Sent as mp3 it arrives as a file with no waveform.
            </p>
            <button
              type="button"
              disabled={!audio || saving !== null}
              onClick={() => void save('wav')}
              className="u-data shrink-0 border border-line/50 px-3 py-2 text-[11px] text-bone/50 transition-colors hover:border-bone/40 hover:text-bone/80 disabled:opacity-50"
            >
              .wav
            </button>
          </div>
          {error && (
            <p role="alert" className="u-data text-[11px] text-signal">
              {error}
            </p>
          )}
        </section>
      </main>

      <footer className="mt-auto pt-6">
        <p className="u-data text-[10px] text-bone/25">
          64 bars · mirrored · nothing leaves this browser
        </p>
      </footer>
    </div>
  )
}
