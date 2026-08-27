# Waveprint

Write a word into a voice note's waveform.

You drop in an audio file, type a short word, and download a new file whose
loudness envelope traces the shape of that word — so when a chat client draws
its own waveform for the message, it draws your word instead of a random
squiggle.

Everything runs in the browser. There is no backend, and no file is uploaded
anywhere.

---

## The constraint that drives the whole thing

WhatsApp's voice-note waveform is a **64-value array, each value 0–100**, stored
in the message protobuf. It is computed by the *sending client* from the audio's
amplitude, at send time. **No metadata field in an OGG, MP3 or WAV is read for
this.** You cannot write the bytes you want into a downloadable file.

The only thing under our control is the audio's amplitude envelope. WhatsApp
divides the track into 64 segments, averages the absolute amplitude of each, and
normalises. So if we impose a gain curve that matches the shape we want,
WhatsApp's own analysis reproduces that shape — approximately.

Three consequences the interface states plainly, next to the controls they
affect:

1. **Approximate, not exact.** The dB-to-byte curve is not public and is not
   linear. The result resembles the target; it does not match it.
2. **The audio will sound chopped.** Forcing loudness up and down every ~200 ms
   makes speech pulse. The smoothing slider trades waveform crispness against
   audio harshness; nothing removes the effect.
3. **Bars mirror around a centre line.** Only height carries meaning, so every
   shape is symmetric top-to-bottom. `H` and `X` are the same silhouette. So are
   `U` and `V`.

## How the processing works

`src/lib/audio.ts`, in order:

1. Decode with `decodeAudioData`, downmix to mono.
2. Optionally trim near-silent head and tail (chat clients often trim it
   themselves, which would shift the whole shape sideways).
3. Split into 64 equal segments and measure each segment's RMS.
4. Compute a per-segment gain so the segment's RMS lands at its target height,
   clamped to a ceiling (default 4×) so silence is not amplified into hiss.
5. Cross-fade the gain across each of the 63 boundaries with a raised cosine
   (default 15 ms, adjustable 0–50 ms) so the output does not click.
6. Never let a target segment be zero — the floor is 5. True silence reads as a
   dropout, and clients sometimes trim it.
7. Scale down if the result would clip.

Then the **verification pass**: the output buffer is re-analysed with the same
64-segment measurement, and *that* is what the "after" circle draws. It is not
the target redrawn — it is what the file actually contains.

## Shape sources

- **Text** — a bar font in `src/lib/barfont.ts`: each character is five column
  heights, 0–100, plus a legibility rating and a note explaining why a weak
  letter is weak. It is a plain data file, meant to be tuned by hand.
- **Preset** — heartbeat, sine, sawtooth, staircase, pulse train, crescendo,
  centre peak. These read better than text does.
- **Draw** — a 64-column pad you drag across, snapped to steps of 5. Arrow keys
  work too.

### Pacing

A phrase longer than about six characters cannot be legible across 64 columns.
Pacing does not add resolution — it controls *when* each word passes under the
playhead, so a phrase arrives in time with the audio:

- **All at once** — words share the strip in proportion to their length.
- **In time** — words are spaced evenly across the clip; `dwell` sets how long
  each holds, `start` pushes the first word later to line up with the talking.
- **Match speech** — bursts of sound in the source are detected and one word is
  dropped onto each, so a word lands where a word is spoken.

Between words the audio is held at 14 rather than the floor, so a short phrase
over a long clip does not mute most of it.

## Running it

```bash
npm install
npm run dev
```

```bash
npm run build      # static output in dist/
npm run preview
npm run assets     # regenerate favicon.svg, icon-512.png and og.png
npm run single     # one self-contained HTML file in dist-single/
```

`npm run single` inlines the entire app — scripts, styles, icon — into one HTML
file you can open straight from disk or hand to someone who will not run a
build. Only the webfonts are fetched; without a network it falls back to system
faces and behaves identically.

## Deploy

One command, from the repo root:

```bash
npx vercel deploy --prod
```

Vercel detects Vite automatically — build command `npm run build`, output
directory `dist`. There is nothing to configure, no environment variables and no
server: the whole thing is static files.

Any static host works the same way. Upload `dist/`.

## Stack

Vite · React · TypeScript · Tailwind · Motion for the few transitions · canvas
for every waveform · [`@breezystack/lamejs`](https://github.com/breezystack/lamejs)
for MP3, loaded on demand so a visit that never downloads never fetches it.

Type is Archivo (expanded, heavy) for display, Instrument Sans for body, and
Martian Mono for anything numeric.

## Non-goals

No accounts, no analytics, no cookie banner, no server-side processing, no
WhatsApp API integration, and no claim anywhere that the output is exact.
