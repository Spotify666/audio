import { useRef, useState } from 'react'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.mp3,.m4a,.wav,.ogg,.opus,.aac,audio/*'

interface Props {
  onFile: (file: File) => void
  compact?: boolean
}

export function Dropzone({ onFile, compact }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const take = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`${(file.size / 1048576).toFixed(1)} MB is over the 10 MB cap.`)
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
        className={`flex flex-col items-center justify-center gap-3 border border-dashed text-center transition-colors ${
          compact ? 'px-4 py-4' : 'px-5 py-10'
        } ${over ? 'border-signal bg-signal/10' : 'border-line/60'}`}
      >
        {!compact && <p className="u-display text-xl text-bone/90">Drop your audio here</p>}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`border border-line/70 bg-ink-deep/60 px-4 py-2 text-sm text-bone transition-colors hover:border-signal hover:text-signal ${
            compact ? 'text-[13px]' : ''
          }`}
        >
          {compact ? 'Use a different file' : 'Choose a file'}
        </button>
        {!compact && (
          <p className="u-data text-[10px] text-bone/35">
            mp3 · m4a · wav · ogg · opus — 10 MB max — never leaves this browser
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Audio file"
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
