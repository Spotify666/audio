# Waveprint

Makes a voice note whose waveform draws a letter.

Runs entirely in the browser. Nothing is uploaded.

---

## Two things that decide the whole design

**1. Only voice notes have a waveform.**

Send the same audio as an mp3 or m4a and WhatsApp treats it as a *document*: a
generic orange audio icon — the same static picture for every file ever sent —
and a plain seek bar. There is no waveform anywhere, so there is nothing for a
shape to appear in.

The 64-bar waveform belongs to voice notes. That means **Ogg Opus**, which is
why it is the only format this app leads with. `.wav` is offered as a fallback
for other players, but a wav will not render a waveform in WhatsApp either.

**2. The audio is generated, not reshaped.**

Taking someone's voice note and shoving its loudness up and down 64 times is
what makes speech stutter and pulse. So the app does not do that. It builds a
carrier — a hum, a wash of filtered noise, a chime — that holds a steady level,
and the letter *is* that carrier's volume over time. There is nothing to
distort, and the shape comes out exact rather than approximate: the measured
envelope matches the target bar for bar.

```
src/lib/synth.ts   carrier + envelope + a correction pass
src/lib/opus.ts    Ogg Opus via opus-recorder's encoder worker
src/lib/glyphs.ts  the letters
src/lib/word.ts    letters -> 64 bars
```

## One letter

A voice-note waveform is small. Sixty-four bars across roughly 170 points of
width is not much, and the bars mirror around a centre line, so only height
carries meaning: no horizontal strokes, no enclosed counters, no difference
between top and bottom.

One letter gets 48 of the 64 bars and reads. Three letters get 17 each and
barely do. Five is mush, and the app says so instead of pretending.

Roughly a dozen shapes are genuinely distinguishable. `O I T L H U V W C J N A`
are the strong ones. `B D Q R X Y Z` and most digits are marked weak in the
interface, because they are.

Run this and look at the result before changing any of them:

```bash
npm run font     # renders every glyph, large and at true voice-note size
```

## Running it

```bash
npm install
npm run dev
```

```bash
npm run build    # static output in dist/
npm run preview
npm run assets   # favicon.svg, icon-512.png, og.png
npm run single   # the whole app as one self-contained HTML file
```

## Deploy

```bash
npx vercel deploy --prod
```

Vercel detects Vite on its own — build `npm run build`, output `dist`. No
environment variables, no server. Any static host works; upload `dist/`.

## Sending it

Attach the `.ogg`. Do not re-record it by holding the mic button — that plays
the file through your speaker into the microphone and the shape is lost.

The receiving client measures the file and draws its own bars using a curve that
is not public and is not linear, so what lands there resembles the preview
rather than matching it exactly.

## Stack

Vite · React · TypeScript · Tailwind · canvas for the waveform ·
[`opus-recorder`](https://github.com/chris-rudmin/opus-recorder) for Ogg Opus.
