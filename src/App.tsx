import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  analyseBars,
  decodeAudioFile,
  downmixToMono,
  formatTime,
  shapeEnvelope,
  trimSilence,
} from './lib/audio'
import type { ShapeResult } from './lib/audio'
import { downloadBlob, encodeMp3, encodeWav, formatBytes } from './lib/encode'
import { COLUMNS, COMFORTABLE_CHARS, applyFloor, buildLayout, nativeWidth } from './lib/envelope'
import type { Layout, PaceMode } from './lib/envelope'
import { legibilityNotes } from './lib/barfont'
import { PRESETS, presetById } from './lib/shapes'
import { Clock, prefersReducedMotion } from './lib/clock'
import { WaveCircle } from './components/WaveCircle'
import { ReadoutStrip } from './components/ReadoutStrip'
import { DrawPad } from './components/DrawPad'
import { Dropzone } from './components/Dropzone'
import { ChatPreview } from './components/ChatPreview'
import { Player } from './components/Player'
import { Logo } from './components/Logo'
import { NowWord } from './components/NowWord'
import { Caution, Panel, Slider, Stat, Tabs } from './components/ui'

type Mode = 'text' | 'preset' | 'draw'

const NOMINAL_DURATION = 12
const SIGNAL = '#FF7A45'
const MINT = '#7FD1A8'

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'shape'

export default function App() {
  // --- shape source -------------------------------------------------------
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('WAVE')
  const [presetId, setPresetId] = useState('heartbeat')
  const [drawValues, setDrawValues] = useState<number[]>(() =>
    Array.from({ length: COLUMNS }, (_, i) => Math.round(20 + 70 * Math.abs(Math.sin(i / 7)))),
  )

  // --- pacing -------------------------------------------------------------
  const [paceMode, setPaceMode] = useState<PaceMode>('fit')
  const [dwell, setDwell] = useState(1.2)
  const [start, setStart] = useState(0)

  // --- audio --------------------------------------------------------------
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<{ raw: Float32Array; rate: number; duration: number } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [trim, setTrim] = useState(true)

  // --- processing ---------------------------------------------------------
  const [smoothingMs, setSmoothingMs] = useState(15)
  const [maxGain, setMaxGain] = useState(4)
  const [result, setResult] = useState<{
    bars: number[]
    stats: ShapeResult
    wav: Blob
    url: string
    mono: Float32Array
  } | null>(null)
  const [working, setWorking] = useState(false)
  const [mp3, setMp3] = useState<{ blob: Blob; progress: number } | null>(null)

  // --- playback -----------------------------------------------------------
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [monitor, setMonitor] = useState<'shaped' | 'original'>('shaped')
  const clock = useMemo(() => new Clock(), [])
  const originalUrl = useRef<string | null>(null)

  /**
   * Everything downstream — the before trace, the pacing timeline and the
   * shaping itself — works on the same signal, so trimming cannot shift the
   * shape out from under the timing.
   */
  const work = useMemo(() => {
    if (!source) return null
    const mono = trim ? trimSilence(source.raw) : source.raw
    return { mono, bars: analyseBars(mono), duration: mono.length / source.rate }
  }, [source, trim])

  const duration = work?.duration ?? 0
  const paceDuration = duration || NOMINAL_DURATION

  // --- the target envelope ------------------------------------------------
  const layout: Layout = useMemo(
    () =>
      buildLayout(text, {
        mode: paceMode,
        start,
        dwell,
        duration: paceDuration,
        bars: work?.bars ?? null,
      }),
    [text, paceMode, start, dwell, paceDuration, work],
  )
  /** The chosen mode could not be honoured — say so rather than silently differ. */
  const paceFellBack = paceMode === 'speech' && layout.mode !== 'speech'

  const targets = useMemo(() => {
    const raw =
      mode === 'text' ? layout.columns : mode === 'preset' ? presetById(presetId).build() : drawValues
    return applyFloor(raw)
  }, [mode, layout, presetId, drawValues])

  const notes = useMemo(() => (mode === 'text' ? legibilityNotes(text) : []), [mode, text])
  const charCount = text.replace(/\s/g, '').length
  const tooLong = mode === 'text' && charCount > COMFORTABLE_CHARS
  const thinWords = layout.slots.filter((s) => s.density < 3).map((s) => s.word)

  // --- load ---------------------------------------------------------------
  const onFile = useCallback(async (f: File) => {
    setLoadError(null)
    setResult(null)
    setMp3(null)
    setPlaying(false)
    try {
      const buffer = await decodeAudioFile(f)
      const raw = downmixToMono(buffer)
      setFile(f)
      setSource({ raw, rate: buffer.sampleRate, duration: buffer.duration })
      if (originalUrl.current) URL.revokeObjectURL(originalUrl.current)
      originalUrl.current = URL.createObjectURL(f)
      setMonitor('original')
    } catch {
      setLoadError(
        'That file could not be decoded here. Browsers vary on m4a and opus — a wav or mp3 always works.',
      )
    }
  }, [])

  // --- process ------------------------------------------------------------
  const runProcess = useCallback(async () => {
    if (!source || !work) return
    setWorking(true)
    setMp3(null)
    await new Promise((r) => setTimeout(r, 0)) // let the button state paint
    const stats = shapeEnvelope(work.mono, source.rate, { targets, smoothingMs, maxGain })
    const wav = encodeWav(stats.samples, source.rate)
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return {
        bars: analyseBars(stats.samples),
        stats,
        wav,
        url: URL.createObjectURL(wav),
        mono: stats.samples,
      }
    })
    setMonitor('shaped')
    setWorking(false)
  }, [source, work, targets, smoothingMs, maxGain])

  // Once processed, keep the result live: changing the shape, the smoothing or
  // the ceiling re-runs the whole chain, including the verification pass.
  const processed = !!result
  useEffect(() => {
    if (!processed || !source) return
    const t = setTimeout(() => void runProcess(), 280)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, smoothingMs, maxGain, trim])

  // --- playback wiring ----------------------------------------------------
  const playbackUrl = monitor === 'shaped' && result ? result.url : originalUrl.current
  useEffect(() => {
    const el = audioRef.current
    if (!el || !playbackUrl) return
    const wasPlaying = !el.paused
    el.src = playbackUrl
    el.load()
    if (wasPlaying) void el.play().catch(() => setPlaying(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackUrl])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el || !playbackUrl) return
    if (el.paused) void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    else {
      el.pause()
      setPlaying(false)
    }
  }, [playbackUrl])

  useEffect(() => () => {
    if (originalUrl.current) URL.revokeObjectURL(originalUrl.current)
  }, [])

  // --- downloads ----------------------------------------------------------
  const name = mode === 'text' ? slug(text) : mode === 'preset' ? presetId : 'drawn'

  const getMp3 = async () => {
    if (!result || !source) return
    setMp3({ blob: new Blob(), progress: 0 })
    const { blob } = await encodeMp3(result.mono, source.rate, 128, (p) =>
      setMp3({ blob: new Blob(), progress: p }),
    )
    setMp3({ blob, progress: 1 })
    downloadBlob(blob, `waveprint-${name}.mp3`)
  }

  const reduced = prefersReducedMotion()
  const fade = reduced
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }

  return (
    <div className="relative z-10 mx-auto max-w-5xl px-4 pb-24 sm:px-6">
      <audio
        ref={audioRef}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        preload="auto"
        className="hidden"
      />

      {/* ------------------------------------------------------- masthead */}
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="u-display text-lg tracking-tight">Waveprint</span>
        </div>
        <p className="u-data text-[10px] text-bone/40">
          runs in your browser · no upload · no account
        </p>
      </header>

      {/* ----------------------------------------------------------- hero */}
      <main>
        <section className="pt-4 pb-10 sm:pt-8">
          <p className="u-label mb-4 text-center">Target envelope · live</p>

          <WaveCircle
            values={targets}
            color={SIGNAL}
            clock={clock}
            slots={mode === 'text' ? layout.slots : undefined}
            ariaLabel={`Target waveform for ${mode === 'text' ? text : name}`}
            className="mb-1"
            max={392}
          />

          <NowWord slots={layout.slots} clock={clock} />

          <div className="mx-auto mt-2 max-w-xl">
            {mode === 'text' && (
              <>
                <label htmlFor="word" className="u-label mb-2 block text-center">
                  Your word
                </label>
                <input
                  id="word"
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 40))}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="type here"
                  style={{
                    // Shrink to fit rather than clip: long phrases stay on one line.
                    fontSize: `clamp(1.05rem, calc(min(36rem, 100vw - 2rem) / ${Math.max(
                      4,
                      [...(text || 'type here')].length * 0.72,
                    ).toFixed(2)}), 3rem)`,
                  }}
                  className="u-display w-full border-b border-line/70 bg-transparent pb-3 text-center uppercase tracking-tight text-bone caret-signal outline-none placeholder:text-line focus:border-signal"
                />
                <p className="u-data mt-2 text-center text-[10px] text-bone/35">
                  {charCount} chars · {nativeWidth(text)} native columns → {COLUMNS} sent
                </p>
              </>
            )}

            {mode === 'preset' && (
              <div className="flex flex-wrap justify-center gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={p.id === presetId}
                    onClick={() => setPresetId(p.id)}
                    className={`u-data border px-3 py-2 text-[11px] transition-colors ${
                      p.id === presetId
                        ? 'border-signal bg-signal text-ink'
                        : 'border-line/60 text-bone/65 hover:border-signal/70 hover:text-bone'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {mode === 'preset' && (
            <p className="mx-auto mt-4 max-w-md text-center text-[13px] text-bone/55">
              {presetById(presetId).blurb}
            </p>
          )}

          {mode === 'draw' && (
            <div className="mx-auto mt-2 max-w-2xl">
              <DrawPad values={drawValues} onChange={setDrawValues} />
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawValues(new Array(COLUMNS).fill(50))}
                  className="u-data border border-line/60 px-3 py-1.5 text-[11px] text-bone/65 hover:border-signal hover:text-signal"
                >
                  Flatten
                </button>
                <button
                  type="button"
                  onClick={() => setDrawValues(new Array(COLUMNS).fill(5))}
                  className="u-data border border-line/60 px-3 py-1.5 text-[11px] text-bone/65 hover:border-signal hover:text-signal"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="mx-auto mt-8 max-w-4xl">
            <ReadoutStrip values={targets} clock={clock} accent={SIGNAL} />
          </div>

          <AnimatePresence>
            {(tooLong || notes.length > 0 || paceFellBack || thinWords.length > 0) && (
              <motion.div {...fade} className="mx-auto mt-5 max-w-2xl space-y-2">
                {tooLong && (
                  <Caution>
                    {charCount} characters across 64 columns leaves about{' '}
                    {(COLUMNS / Math.max(1, charCount)).toFixed(1)} columns each. Past six characters
                    legibility drops sharply — it will still process, it just will not read.
                  </Caution>
                )}
                {thinWords.length > 0 && (
                  <Caution>
                    {thinWords.join(', ')} {thinWords.length > 1 ? 'get' : 'gets'} under three columns
                    per letter at this pace. Raise the dwell or shorten the phrase.
                  </Caution>
                )}
                {paceFellBack && (
                  <Caution>
                    This clip has no clear run of separate bursts to hang{' '}
                    {layout.slots.length} words on, so they are spread evenly instead.
                  </Caution>
                )}
                {notes.map((n) => (
                  <p key={n} className="flex gap-2 text-[13px] leading-relaxed text-bone/45">
                    <span aria-hidden className="u-data mt-[3px] shrink-0 text-[10px]">
                      [ i ]
                    </span>
                    <span>{n}</span>
                  </p>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 flex justify-center">
            <Tabs
              label="Shape source"
              value={mode}
              onChange={(v) => setMode(v)}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'preset', label: 'Preset' },
                { value: 'draw', label: 'Draw' },
              ]}
            />
          </div>
        </section>

        {/* ------------------------------------------------------- pacing */}
        {mode === 'text' && (
          <Panel
            label="Pace"
            index="01"
            className="mb-4"
            right={
              <span className="u-data text-[10px] text-bone/35">
                {(paceDuration / COLUMNS).toFixed(3)}s per column
              </span>
            }
          >
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-8">
              <div>
                <Tabs
                  label="Pace mode"
                  value={paceMode}
                  onChange={setPaceMode}
                  options={[
                    { value: 'fit', label: 'All at once' },
                    { value: 'timed', label: 'In time' },
                    { value: 'speech', label: 'Match speech' },
                  ]}
                />
                <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-bone/55">
                  {paceMode === 'fit' &&
                    'The whole phrase shares the 64 columns, split by word length. Everything shows at once.'}
                  {paceMode === 'timed' &&
                    'Words are spaced evenly across the clip and each holds for a set number of seconds, so the phrase arrives in time rather than all at once. The waveform still has only 64 columns — this buys timing, not resolution.'}
                  {paceMode === 'speech' &&
                    'Each word is dropped onto a burst of sound in your clip, so a word lands where a word is spoken. Needs an audio file with clear gaps between phrases.'}
                </p>
                {paceMode === 'speech' && !source && (
                  <p className="u-data mt-3 text-[10px] text-signal/80">
                    add a clip below to detect its phrases
                  </p>
                )}
              </div>

              <div className="space-y-5">
                <Slider
                  id="start"
                  label="Phrase starts at"
                  value={start}
                  min={0}
                  max={Math.max(0.5, paceDuration * 0.7)}
                  step={0.05}
                  unit="s"
                  disabled={paceMode !== 'timed'}
                  onChange={setStart}
                  hint="Push the first word later to line it up with when the talking starts."
                />
                <Slider
                  id="dwell"
                  label="Dwell per word"
                  value={Math.min(dwell, layout.maxDwell)}
                  min={0.2}
                  max={Math.max(0.4, Number(layout.maxDwell.toFixed(2)))}
                  step={0.05}
                  unit="s"
                  disabled={paceMode !== 'timed'}
                  onChange={setDwell}
                  hint={`${Math.max(1, Math.round(Math.min(dwell, layout.maxDwell) / (paceDuration / COLUMNS)))} of 64 columns per word · rest of each slot is a rest`}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={paceMode !== 'timed'}
                    onClick={() => {
                      setStart(0)
                      setDwell(Number(layout.maxDwell.toFixed(2)))
                    }}
                    className="u-data border border-line/60 px-3 py-1.5 text-[11px] text-bone/70 transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
                  >
                    Fill the clip
                  </button>
                  <span className="u-data text-[10px] text-bone/35">
                    {layout.slots.length} word{layout.slots.length === 1 ? '' : 's'}
                    {duration ? ` across ${formatTime(duration)}` : ` (assuming a ${NOMINAL_DURATION}s clip)`}
                  </span>
                </div>
                {layout.slots.length > 0 && (
                  <ol className="u-data flex flex-wrap gap-x-4 gap-y-1 border-t border-line/35 pt-3 text-[10px] text-bone/40">
                    {layout.slots.map((sl) => (
                      <li key={`${sl.word}-${sl.start}`}>
                        <span className="text-signal/70">{sl.startTime.toFixed(1)}s</span> {sl.word}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </Panel>
        )}

        {/* -------------------------------------------------------- audio */}
        {!source && (
          <div className="mb-4">
            <Dropzone onFile={onFile} />
            {loadError && (
              <p role="alert" className="u-data mt-2 text-[11px] text-signal">
                {loadError}
              </p>
            )}
          </div>
        )}

        <AnimatePresence>
          {source && (
            <motion.div {...fade} className="space-y-4">
              <Panel
                label="Before and after"
                index="03"
                right={
                  <span className="u-data max-w-[45%] truncate text-[10px] text-bone/40">
                    {file?.name}
                  </span>
                }
              >
                <div className="grid gap-8 sm:grid-cols-2">
                  <div>
                    <div className="mb-3 flex items-baseline justify-between">
                      <span className="u-label" style={{ color: MINT }}>
                        Before · measured
                      </span>
                      <span className="u-data text-[10px] text-bone/35">{formatTime(duration)}</span>
                    </div>
                    <WaveCircle
                      values={work?.bars ?? []}
                      color={MINT}
                      clock={monitor === 'original' ? clock : null}
                      morph={false}
                      max={300}
                      ariaLabel="Waveform of the original file"
                    />
                    <p className="mt-3 text-[12px] leading-relaxed text-bone/45">
                      The real envelope of the file you dropped in.
                    </p>
                  </div>

                  <div>
                    <div className="mb-3 flex items-baseline justify-between">
                      <span className="u-label" style={{ color: SIGNAL }}>
                        After · re-measured
                      </span>
                      <span className="u-data text-[10px] text-bone/35">
                        {result ? 'verified' : 'not run'}
                      </span>
                    </div>
                    <WaveCircle
                      values={result ? result.bars : new Array(COLUMNS).fill(5)}
                      ghost={result ? targets : null}
                      color={SIGNAL}
                      clock={monitor === 'shaped' ? clock : null}
                      max={300}
                      ariaLabel="Waveform measured back off the processed file"
                    />
                    <p className="mt-3 text-[12px] leading-relaxed text-bone/45">
                      {result
                        ? 'Measured back off the processed audio, not drawn from the target. The faint shape behind is what we asked for.'
                        : 'Nothing measured yet. Process the audio to fill this in.'}
                    </p>
                  </div>
                </div>

                <div className="mt-8 border-t border-line/35 pt-6">
                  {!result ? (
                    <button
                      type="button"
                      onClick={() => void runProcess()}
                      disabled={working}
                      className="u-display w-full bg-signal px-6 py-4 text-lg text-ink transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
                    >
                      {working ? 'Processing…' : 'Process audio'}
                    </button>
                  ) : (
                    <>
                      <div className="mb-5 flex flex-wrap items-center gap-3">
                        <Tabs
                          label="Monitor"
                          value={monitor}
                          onChange={setMonitor}
                          options={[
                            { value: 'shaped', label: 'Shaped' },
                            { value: 'original', label: 'Original' },
                          ]}
                        />
                        <span className="u-data text-[10px] text-bone/35">
                          {working ? 're-processing…' : 'listen before you commit'}
                        </span>
                      </div>
                      <Player
                        audio={audioRef.current}
                        clock={clock}
                        playing={playing}
                        onToggle={toggle}
                        duration={monitor === 'shaped' ? duration : (source?.duration ?? duration)}
                        accent={monitor === 'shaped' ? SIGNAL : MINT}
                        hint="The shaped version pulses — loudness is being pushed up and down roughly every fifth of a second. That is the trade."
                      />
                    </>
                  )}
                </div>
              </Panel>

              {/* ------------------------------------------------ controls */}
              <div className="grid gap-4 md:grid-cols-2">
                <Panel label="Processing" index="04">
                  <div className="space-y-6">
                    <Slider
                      id="smoothing"
                      label="Smoothing"
                      value={smoothingMs}
                      min={0}
                      max={50}
                      step={1}
                      unit="ms"
                      onChange={setSmoothingMs}
                      hint="Cross-fade at each of the 63 segment boundaries. Low keeps the waveform crisp and the audio harsh; high is kinder to listen to and blurs the shape."
                    />
                    <Slider
                      id="gain"
                      label="Gain ceiling"
                      value={maxGain}
                      min={1.5}
                      max={8}
                      step={0.1}
                      unit="×"
                      onChange={setMaxGain}
                      hint="How hard a quiet segment may be pushed up. Past about 4× you are amplifying room noise into hiss."
                    />
                    <label className="flex items-start gap-3 text-[13px] text-bone/65">
                      <input
                        type="checkbox"
                        checked={trim}
                        onChange={(e) => setTrim(e.target.checked)}
                        className="mt-1 size-4 accent-[#FF7A45]"
                      />
                      <span>
                        Trim silence at the ends first
                        <span className="block text-[12px] text-bone/40">
                          Chat clients often trim it themselves, which shifts the whole shape sideways.
                        </span>
                      </span>
                    </label>
                  </div>
                </Panel>

                <Panel label="Verification" index="05">
                  {result ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <Stat k="Segments" v={`${COLUMNS} × ${(duration / COLUMNS).toFixed(3)}s`} />
                        <Stat
                          k="Match"
                          v={`${matchScore(targets, result.bars)}%`}
                          tone={matchScore(targets, result.bars) > 80 ? 'mint' : 'signal'}
                        />
                        <Stat
                          k="Hit the ceiling"
                          v={`${result.stats.clipped}/64`}
                          tone={result.stats.clipped > 8 ? 'signal' : 'bone'}
                        />
                        <Stat
                          k="Silent in source"
                          v={`${result.stats.dead}/64`}
                          tone={result.stats.dead > 0 ? 'signal' : 'bone'}
                        />
                        <Stat k="Cross-fade" v={`${result.stats.effectiveSmoothingMs.toFixed(1)}ms`} />
                        <Stat k="WAV size" v={formatBytes(result.wav.size)} />
                      </div>
                      <p className="mt-5 text-[13px] leading-relaxed text-bone/50">
                        Match compares the shape we asked for against the shape measured back off the
                        output. It will never be 100 — smoothing rounds the corners, and your chat
                        client applies its own curve on top of that. Treat every number here as
                        approximate.
                      </p>
                      {result.stats.dead > 0 && (
                        <div className="mt-4">
                          <Caution>
                            {result.stats.dead} segments are silent in your source. No amount of gain
                            makes a shape out of silence — those columns will read flat.
                          </Caution>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-bone/50">
                      After processing, the output buffer is re-analysed with the same 64-segment
                      measurement used on the original. The “after” circle shows that measurement, not
                      the target — so you see what the file actually contains.
                    </p>
                  )}
                </Panel>
              </div>

              {/* ------------------------------------------------ delivery */}
              {result && (
                <>
                  <ChatPreview
                    values={result.bars}
                    duration={duration}
                    clock={monitor === 'shaped' ? clock : null}
                    playing={playing}
                    onToggle={toggle}
                  />

                  <Panel label="Download" index="06">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => void getMp3()}
                        disabled={!!mp3 && mp3.progress < 1}
                        className="u-display bg-signal px-6 py-4 text-base text-ink transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {mp3 && mp3.progress < 1
                          ? `Encoding ${Math.round(mp3.progress * 100)}%`
                          : 'Download MP3'}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadBlob(result.wav, `waveprint-${name}.wav`)}
                        className="border border-line/70 px-5 py-4 text-sm text-bone/80 transition-colors hover:border-mint hover:text-mint"
                      >
                        Download WAV · {formatBytes(result.wav.size)}
                      </button>
                      <p className="u-data text-[10px] leading-relaxed text-bone/35 sm:max-w-[16rem]">
                        MP3 at 128 kbps mono. WAV is bigger but lossless — the envelope survives either.
                      </p>
                    </div>

                    <div className="mt-6 border-t border-line/35 pt-5">
                      <h3 className="u-label mb-3">How to send it</h3>
                      <ol className="space-y-2 text-[13px] leading-relaxed text-bone/60">
                        <li>
                          <span className="u-data mr-2 text-signal">01</span>
                          Attach the file. In WhatsApp: paperclip → Document or Audio.
                        </li>
                        <li>
                          <span className="u-data mr-2 text-signal">02</span>
                          Do not re-record it by holding the mic button. That re-encodes your speaker
                          output through the microphone and the shape is lost.
                        </li>
                        <li>
                          <span className="u-data mr-2 text-signal">03</span>
                          The receiving client measures the file and draws its own 64 bars. What you
                          see there will resemble the circle above, not match it.
                        </li>
                      </ol>
                    </div>
                  </Panel>

                  <div className="pt-2">
                    <Dropzone onFile={onFile} compact />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* --------------------------------------------------------- copy */}
        <section className="mt-16 grid gap-8 border-t border-line/35 pt-10 sm:grid-cols-2">
          <div>
            <h2 className="u-display mb-4 text-2xl">What this actually does</h2>
            <p className="mb-3 text-[14px] leading-relaxed text-bone/60">
              A voice note’s waveform is 64 numbers between 0 and 100, and the sending app computes
              them from the audio itself at the moment you hit send. There is no field in an mp3 or
              an ogg that says what the bars should look like.
            </p>
            <p className="text-[14px] leading-relaxed text-bone/60">
              So the only lever is loudness. Waveprint splits your clip into 64 equal slices, measures
              how loud each one is, and scales it up or down until the pattern of loudness matches the
              shape you drew. When the sending app does its own measurement, it finds the shape
              already there.
            </p>
          </div>
          <div>
            <h2 className="u-display mb-4 text-2xl">What it costs</h2>
            <ul className="space-y-3 text-[14px] leading-relaxed text-bone/60">
              <li>
                <strong className="text-bone/85">It will sound wrong.</strong> Pushing loudness around
                every fifth of a second makes speech pulse and stutter. Smoothing softens it; nothing
                removes it.
              </li>
              <li>
                <strong className="text-bone/85">It is approximate.</strong> The curve chat clients use
                to turn loudness into bar height is not public and is not linear. You get a family
                resemblance.
              </li>
              <li>
                <strong className="text-bone/85">Every shape is symmetric.</strong> Bars mirror around
                a centre line, so only height carries meaning. H and X are the same picture. So are U
                and V.
              </li>
              <li>
                <strong className="text-bone/85">Nothing is uploaded.</strong> Decoding, shaping and
                encoding all happen in this tab. There is no server to send your voice notes to.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line/35 pt-6">
        <div className="flex items-center gap-3">
          <Logo size={22} />
          <span className="u-data text-[10px] text-bone/35">
            waveprint · 64 columns · 0–100 · mirrored · approximate
          </span>
        </div>
        <a
          href="https://github.com"
          className="u-data text-[10px] text-bone/35 underline-offset-4 hover:text-signal hover:underline"
        >
          static site · no analytics
        </a>
      </footer>
    </div>
  )
}

/** How close the measured output came to the requested shape, 0-100. */
function matchScore(target: number[], measured: number[]): number {
  if (!measured.length) return 0
  let err = 0
  for (let i = 0; i < target.length; i++) err += Math.abs(target[i] - (measured[i] ?? 0))
  return Math.max(0, Math.round(100 - err / target.length))
}
