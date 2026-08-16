---
name: inhabit-wine
description: Drive and observe the running Cellar Compass page (the wine tool — Find, Atlas and the sommelier) through its own controls. Use this WHENEVER you need to move the page, read what the reader is looking at, turn or walk him through the Atlas, or check that a control still works — instead of screenshots, computer-use, or reading the source and guessing.
user_invocable: true
---

# Inhabit the wine page

Cellar Compass carries its own controls on the page as `window.inhabit`. That is
the way to drive it and to look at it. Do NOT reach for screenshots or
computer-use: what you would be reading off a picture the page will tell you in
words, and what you would be clicking it will press for you.

There is no sidecar to poll. The page is one file and is served as one file, so
the transport is the page itself: evaluate against the global with any browser
tool (the Browser pane's `javascript_tool`, or Chrome's).

## Where it runs

- published: `https://agent.farm/VinoAtlas/wine/`
- from the repo: `python3 WineAtlas/build.py`, then serve the repo root and open
  `cellar_compass_standalone.html`

Ask the page which build it is holding before believing anything about it —
`document.documentElement.dataset.build` against
`grep -o "const BUILD='[0-9a-f]*'" docs/wine/index.html`. Hours have gone to a
browser holding a stale copy.

## Bootstrap — read the live guide first

The page is self-describing. One call returns what it is, how the round trip
works, every tool with its input schema, and the ledger of its controls:

    inhabit.guide()

This file deliberately lists **no tools**. The catalogue grows; the page is the
single source of truth, and a tool copied into a document here is a tool that
will be wrong later.

    inhabit.observe()            what the reader is looking at, in words
    inhabit.call(name, input)    press one, and read back what the page shows
    inhabit.ask(text)            put words to the sommelier and let it drive

`call()` answers with the page's own observation, so the result and the new
state are one thing; there is nothing to poll and nothing to guess.

## One surface, not two

`guide().tools` is the same catalogue sent to the sommelier, `call()` goes
through the same runner its tool calls go through, and `observe()` is the same
observation it reads. So driving the page from here tests the sommelier, and a
tool that rots does so visibly from both sides. There are tests asserting it.

## What is his

Marking a wine right or wrong and Reset are the reader's and have no tool — his
marks are the measurement. So are the words in his own box and the key. Every
other control on the page has a hand, and `guide().reach` is the whole account:
each control, and either the tool that reaches it or the reason it is his.

## Standing caveats

- **A hidden tab never recalculates style and never fires a frame.** A headless
  or background tab reports zero-size canvases and hangs any test that waits on
  the frame clock. Run the acceptance suite in a visible browser tab; `AT.step()`
  advances the Atlas by hand where a test cannot wait.
- The Atlas eases: `observe()` reports where the reader is being **taken**, not
  where he still points. That is deliberate — a reading taken the instant a move
  is asked for is a reading of the move before it.
- The acceptance suite, from the page, with the repo root served:

      fetch('/WineAtlas/acceptance_tests.js').then(r=>r.text()).then(src=>eval(src))
