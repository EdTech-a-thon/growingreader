#!/bin/sh
# Generates the recordings in the demo backup (then run: node scripts/make-demo-backup.mjs).
# macOS only: uses the built-in `say` voice and `afconvert`. Each script is a deliberate
# misreading of a demo passage, so the Mark reading screen has something real to mark.
# The output is gitignored; without it the demo readings load with no audio.
set -eu
cd "$(dirname "$0")/.."
out=src/dev/demo-audio
mkdir -p "$out"

speak() {
  name=$1
  text=$2
  say -v Samantha -r 140 -o "$out/$name.aiff" "$text"
  afconvert -f WAVE -d LEI16@16000 -c 1 "$out/$name.aiff" "$out/$name.wav"
  rm "$out/$name.aiff"
  echo "wrote $out/$name.wav"
}

# Camp, version 1, already marked: "a" read as "the", "flip... flap" self-corrected, "sleep" read as "bed".
speak ada-camp-1 "Sam and Pam went to camp. At camp they slept in the tent. The tent was red and had a flap.
At night the wind hit the flip [[slnc 400]] flap. Flap, flap, flap went the tent. Sam did not like the sound.
Pam said, It is just the wind. Go to sleep. So Sam went to bed. In the morning the sun was up
and the wind was gone. Sam and Pam ran to the lake and had a swim. It was the best trip yet."

# Camp, version 2, left for you to mark: "rod... red" self-corrected, the third line skipped,
# a long hesitation before "pond", and a repetition that DIBELS ignores.
speak ada-camp-2 "Sam and Pam went to camp. At camp they slept in a tent. The tent was rod [[slnc 500]] red and had a flap.
At night the wind hit the flap. Flap, flap, flap went the tent. Sam did not, did not like the sound.
and the wind was gone. Sam and Pam ran to the [[slnc 3500]] pond and had a swim. It was the best trip yet."

# Ship, marking started but not finished: "dock" read as "duck", "captain" as "cap tin".
speak marcus-ship "The ship sat in the duck. Men ran up the plank with sacks and kegs. The cap tin stood on the deck
and shouted at them to be quick. A gull sat on the mast and did not move. When the last sack was on
the ship, the men pulled up the plank. The ship slid out of the dock and into the bay. The gull
still sat on the mast as the land slipped away behind them."
