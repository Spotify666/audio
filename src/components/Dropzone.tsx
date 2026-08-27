import { useRef, useState } from 'react'

export const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.mp3,.m4a,.wav,.ogg,.opus,.aac,audio/*'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
  compact?: boolean
}

export function Dropzone({ onFile, disabled, compact }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const take = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`${(file.size / 1048576).toFixed(1)} MB is over the 10 MB cap. Trim the clip and try again.`)
      return
    }
    setError(null)
    onFile(file)
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          take(e.dataTransfer.files?.[0])
        }}
        className={`u-panel u-tick flex flex-col items-center justify-center gap-3 text-center transition-colors ${
          compact ? 'px-5 py-6' : 'px-6 py-12 sm:py-16'
        } ${over ? 'border-signal/80 bg-signal/8' : 'border-dashed'}`}
      >
        <span className="u-label">{compact ? 'Replace clip' : 'Step 02 · your audio'}</span>
        <p className={compact ? 'text-sm text-bone/70' : 'u-display text-2xl sm:text-3xl'}>
          {compact ? 'Drop another file to start over' : 'Drop a voice note here'}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="border border-line/70 bg-ink-deep/60 px-4 py-2 text-sm text-bone transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
        >
          Choose a file
        </button>
        <p className="u-data text-[10px] text-bone/35">
          mp3 · m4a · wav · ogg · opus — 10 MB max — never leaves this browser
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Audio file to reshape"
          onChange={(e) => {
            take(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {error && (
        <p role="alert" className="u-data mt-2 text-[11px] text-signal">
          {error}
        </p>
      )}
    </div>
  )
}
