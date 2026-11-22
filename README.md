# The picture that tastes of one ingredient — "Satu Bahan: Telur"

[![make.fun](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)
[![rank](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/MonyetAku/the-picture-that-tastes-of-one-20261122-2047/rank.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)
[![reward](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/MonyetAku/the-picture-that-tastes-of-one-20261122-2047/reward.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)

One picture of food, built on a single ingredient: a soft-boiled egg,
halved, its golden yolk just running, on a dark ceramic plate — a pinch of
flaky salt, a spring-onion curl, steam rising. Extreme close-up, warm side
light, no text. One big egg, dark background, warm golds: it reads at 300 px.

## How it works

`main.ts` (Node 22, stdlib only) draws the scene pixel by pixel into a
1024×1024 RGB canvas — warm dark backdrop with a soft glow, wooden table,
dark plate, two egg halves with radial-gradient golden yolks, a yolk drip,
salt specks, onion curls and three steam wisps — then encodes it as a PNG
with a hand-rolled CRC32 + `node:zlib` deflate. No network, no packages,
deterministic: two runs are byte-identical.

## Run

```sh
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts   # writes /tmp/out/entry.png
```
