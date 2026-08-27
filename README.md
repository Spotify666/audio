# Waveprint

Type a word, drop in an audio file, download it with the word written into its
loudness envelope — so a chat waveform draws your word instead of a squiggle.

Runs entirely in the browser. Nothing is uploaded.

## Flow

1. Type a word (short words read best — one to three letters).
2. Drop in an audio file (mp3 · m4a · wav · ogg · opus, 10 MB max).
3. Two WhatsApp-style bubbles show **before** (your file's real envelope) and
   **after** (measured back off the processed audio — not the target redrawn).
   Both play.
4. **Download MP3.** `.ogg` and `.wav` are one click away.

One honest note, stated once in the UI: WhatsApp draws waveform bars only for
voice notes, which are Ogg Opus. An mp3 attachment arrives as a plain audio
file with a seek bar. The `.ogg` button exists for when the bars themselves are
the point.

## How it works

- `src/lib/word.ts` + `src/lib/glyphs.ts` — the word becomes 64 bar heights
  (0–100, floored at 6 so no segment reads as a dropout). Each glyph is a
  13-column profile tuned against a contact sheet rendered at true voice-note
  size: `npm run font`.
- `src/lib/shape.ts` — decode, downmix to mono, trim silent ends, split into 64
  segments, scale each segment's RMS toward its target height (gain ceiling 4×,
  then a fine correction pass), raised-cosine cross-fade at every boundary. The
  smoothing slider sets that cross-fade (0–50 ms).
- `src/lib/encode.ts` — MP3 via lamejs, Ogg Opus via opus-recorder's worker,
  WAV inline. Encoders load only when a download starts.

The "after" bubble is a re-analysis of the output buffer with the same
64-segment measurement used on the original — what the file actually contains,
not what was asked for.

## Running it

```bash
npm install
npm run dev
```

```bash
npm run build    # static output in dist/
npm run preview
npm run font     # glyph contact sheet at true voice-note size
npm run assets   # favicon.svg, icon-512.png, og.png
npm run single   # the whole app as one self-contained HTML file
```

## Deploy

```bash
npx vercel deploy --prod
```

Vercel detects Vite on its own — build `npm run build`, output `dist`. No
environment variables, no server. Any static host works; upload `dist/`.

## Stack

Vite · React · TypeScript · Tailwind · canvas for the waveforms ·
[`@breezystack/lamejs`](https://github.com/breezystack/lamejs) for MP3 ·
[`opus-recorder`](https://github.com/chris-rudmin/opus-recorder) for Ogg Opus.
