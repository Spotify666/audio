import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COMFORTABLE, renderWord, weakCharacters } from './lib/word'
import { decodeFile, measureBars, reshape } from './lib/shape'
import type { Source } from './lib/shape'
import { download, encodeMp3, encodeOpus, encodeWav } from './lib/encode'
import { VoiceNote } from './components/VoiceNote'
import { Dropzone } from './components/Dropzone'
import { Logo } from './components/Logo'

const MAX_CHARS = 6

/** Only one preview plays at a time, like a chat. */
let liveAudio: HTMLAudioElement | null = null

function usePlayer(url: string | null) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const raf = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const a = new Audio()
    a.preload = 'auto'
    ref.current = a
    const loop = () => {
      if (a.duration) setProgress(a.currentTime / a.duration)
      if (!a.paused) raf.current = requestAnimationFrame(loop)
    }
    const onPlay = () => {
      setPlaying(true)
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(loop)
    }
    const onStop = () => {
      setPlaying(false)
      if (a.duration) setProgress(a.currentTime / a.duration)
    }
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onStop)
    a.addEventListener('ended', onStop)
    return () => {
      cancelAnimationFrame(raf.current)
      a.pause()
      a.removeAttribute('src')
      if (liveAudio === a) liveAudio = null
    }
  }, [])

  useEffect(() => {
    const a = ref.current
    if (!a) return
    const wasPlaying = !a.paused
    if (url) {
      a.src = url
      a.load()
      setProgress(0)
      if (wasPlaying) void a.play().catch(() => setPlaying(false))
    } else {
      a.pause()
      a.removeAttribute('src')
      setProgress(0)
    }
  }, [url])

  const toggle = useCallback(() => {
    const a = ref.current
    if (!a || !a.src) return
    if (a.paused) {
      if (liveAudio && liveAudio !== a) liveAudio.pause()
      liveAudio = a
      void a.play().catch(() => setPlaying(false))
    } else a.pause()
  }, [])

  return { playing, progress, toggle }
}

export default function App() {
  const [word, setWord] = useState('WOW')
  const [smoothing, setSmoothing] = useState(15)
  const [scale, setScale] = useState(1)

  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [shaped, setShaped] = useState<{ url: string; bars: number[]; samples: Float32Array } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState<'mp3' | 'ogg' | 'wav' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const target = useMemo(() => renderWord(word), [word])
  const weak = useMemo(() => weakCharacters(word), [word])
  const chars = target.chars

  const before = usePlayer(originalUrl)
  const after = usePlayer(shaped?.url ?? null)

  const onFile = useCallback(async (f: File) => {
    setError(null)
    setBusy(true)
    try {
      const decoded = await decodeFile(f)
      setFile(f)
      setSource(decoded)
      setOriginalUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(f)
      })
    } catch {
      setError('That file could not be decoded here. A wav or mp3 always works.')
    } finally {
      setBusy(false)
    }
  }, [])

  // Re-process whenever the word, the smoothing or the file changes.
  useEffect(() => {
    if (!source) return
    const id = setTimeout(() => {
      const samples = reshape(source.mono, source.rate, target.columns, smoothing)
      const url = URL.createObjectURL(encodeWav(samples, source.rate))
      setShaped((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url, bars: measureBars(samples), samples }
      })
    }, 250)
    return () => clearTimeout(id)
  }, [source, target, smoothing])

  useEffect(
    () => () => {
      setShaped((p) => (p && URL.revokeObjectURL(p.url), null))
      setOriginalUrl((p) => (p && URL.revokeObjectURL(p), null))
    },
    [],
  )

  const name = (chars.join('') || 'waveprint').toLowerCase()

  const save = async (kind: 'mp3' | 'ogg' | 'wav') => {
    if (!shaped || !source) return
    setError(null)
    setSaving(kind)
    try {
      if (kind === 'mp3') download(await encodeMp3(shaped.samples, source.rate), `${name}.mp3`)
      else if (kind === 'ogg') download(await encodeOpus(shaped.samples, source.rate), `${name}.ogg`)
      else download(encodeWav(shaped.samples, source.rate), `${name}.wav`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the file.')
    } finally {
      setSaving(null)
    }
  }

  const tooMany = chars.length > COMFORTABLE

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-8 px-5 py-8">
      <header className="flex items-center gap-2.5">
        <Logo />
        <span className="u-display text-[15px] tracking-tight">Waveprint</span>
      </header>

      <main className="flex flex-col gap-8">
        {/* Preview: the message as WhatsApp shows it */}
        <section className="flex flex-col gap-4">
          <div
            className="flex w-full flex-col gap-5 overflow-x-auto rounded-lg bg-[#0B141A] px-4 py-6"
            style={{ alignItems: 'safe center' }}
          >
            {source && (
              <div className="flex flex-col gap-1.5">
                <span className="u-label" style={{ color: '#7FD1A8' }}>
                  Before · your audio
                </span>
                <VoiceNote
                  variant="in"
                  bars={source.bars}
                  duration={source.duration}
                  progress={before.progress}
                  playing={before.playing}
                  onToggle={before.toggle}
                  scale={scale}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {source && (
                <span className="u-label self-end" style={{ color: '#FF7A45' }}>
                  After · processed
                </span>
              )}
              <VoiceNote
                bars={shaped?.bars ?? target.columns}
                duration={source?.duration ?? 0}
                progress={after.progress}
                playing={after.playing}
                onToggle={after.toggle}
                scale={scale}
              />
            </div>
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

        {/* The word */}
        <section className="flex flex-col gap-3">
          <label htmlFor="word" className="u-label">
            Your word
          </label>
          <input
            id="word"
            value={word}
            onChange={(e) => setWord(e.target.value.replace(/\s+/g, '').slice(0, MAX_CHARS))}
            autoComplete="off"
            spellCheck={false}
            placeholder="WOW"
            className="u-display w-full border-b-2 border-line/60 bg-transparent pb-2 text-center text-5xl uppercase tracking-[0.06em] text-bone caret-signal outline-none placeholder:text-line focus:border-signal"
          />
          <p className="u-data flex items-center justify-center gap-2 text-[11px]">
            {chars.length === 0 ? (
              <span className="text-bone/30">type a word</span>
            ) : (
              <>
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: tooMany || weak.length ? '#FF7A45' : '#7FD1A8' }}
                />
                <span className={tooMany || weak.length ? 'text-signal' : 'text-bone/45'}>
                  {tooMany
                    ? `${chars.length} letters share 64 bars — short words read best`
                    : weak.length
                      ? `${weak.join(', ')} ${weak.length > 1 ? 'are' : 'is'} hard to read as bars`
                      : `${target.perChar} of 64 bars per letter`}
                </span>
              </>
            )}
          </p>
        </section>

        {/* The audio */}
        {!source ? (
          <Dropzone onFile={(f) => void onFile(f)} />
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor="smoothing" className="u-label">
                  Smoothing
                </label>
                <output htmlFor="smoothing" className="u-data text-[11px] text-signal">
                  {smoothing}ms
                </output>
              </div>
              <input
                id="smoothing"
                type="range"
                min={0}
                max={50}
                step={1}
                value={smoothing}
                onChange={(e) => setSmoothing(Number(e.target.value))}
              />
              <p className="text-[12px] leading-snug text-bone/40">
                Low keeps the shape crisp and the audio choppy; high is easier on the ears.
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <button
                type="button"
                disabled={!shaped || saving !== null}
                onClick={() => void save('mp3')}
                className="u-display w-full bg-signal px-6 py-4 text-lg text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving === 'mp3' ? 'Encoding…' : 'Download MP3'}
              </button>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] leading-snug text-bone/45">
                  WhatsApp only draws waveform bars for voice notes — send the .ogg for that; an mp3
                  arrives as a plain audio file.
                </p>
                <div className="flex shrink-0 gap-2">
                  {(['ogg', 'wav'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={!shaped || saving !== null}
                      onClick={() => void save(k)}
                      className="u-data border border-line/50 px-3 py-2 text-[11px] text-bone/50 transition-colors hover:border-bone/40 hover:text-bone/80 disabled:opacity-50"
                    >
                      {saving === k ? '…' : `.${k}`}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <Dropzone compact onFile={(f) => void onFile(f)} />
            {file && <p className="u-data -mt-4 text-[10px] text-bone/25">{file.name}</p>}
          </>
        )}

        {busy && <p className="u-data text-[11px] text-bone/40">decoding…</p>}
        {error && (
          <p role="alert" className="u-data text-[11px] text-signal">
            {error}
          </p>
        )}
      </main>

      <footer className="mt-auto pt-6">
        <p className="u-data text-[10px] text-bone/25">
          64 bars · mirrored · approximate · nothing leaves this browser
        </p>
      </footer>
    </div>
  )
}
