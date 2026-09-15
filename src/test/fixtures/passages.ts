// Made-up phonics-style passages; nothing here is a real teacher's material.
export const CAMP_TEXT = `Sam and Pam went to camp. At camp they slept in a tent. The tent was red and had a flap.
At night the wind hit the flap. Flap, flap, flap went the tent. Sam did not like the sound.
Pam said, "It is just the wind. Go to sleep." So Sam went to sleep. In the morning the sun was up
and the wind was gone. Sam and Pam ran to the lake and had a swim. It was the best trip yet.`;

export const SHIP_TEXT = `The ship sat in the dock. Men ran up the plank with sacks and kegs. The captain stood on the deck
and shouted at them to be quick. A gull sat on the mast and did not move. When the last sack was on
the ship, the men pulled up the plank. The ship slid out of the dock and into the bay. The gull
still sat on the mast as the land slipped away behind them.`;

/** A near copy of CAMP_TEXT with a few words changed. */
export const CAMP_TEXT_VARIANT = CAMP_TEXT.replace('red', 'blue').replace('lake', 'pond').replace('best', 'top');

export const CAMP_CLEAN = 'Sam and Pam went to camp. At camp they slept in a tent. The tent was red and had a flap. At night the wind hit the flap. Flap flap flap went the tent. Sam did not like the sound. Pam said it is just the wind. Go to sleep. So Sam went to sleep. In the morning the sun was up and the wind was gone. Sam and Pam ran to the lake and had a swim. It was the best trip yet.';

/** Restarts and sounding-out: the student repeats phrases and breaks words apart. */
export const CAMP_RESTARTS = 'Sam and Pam went to Sam and Pam went to camp. At camp they s sl slept in a tent. The tent was red and had a f fl flap. At night the wind hit the flap. Flap flap flap went the tent. Sam did not Sam did not like the sound. Pam said it is just the wind go to sleep. So Sam went to sleep. In the morning the sun was up and the wind was gone. Sam and Pam ran to the lake and had a swim. It was the best trip yet.';

/** Stops about 70% of the way through. */
export const CAMP_STOPS_EARLY = 'Sam and Pam went to camp. At camp they slept in a tent. The tent was red and had a flap. At night the wind hit the flap. Flap flap flap went the tent. Sam did not like the sound. Pam said it is just the wind. Go to sleep. So Sam went to sleep. In the morning the sun';

/** Roughly half the words wrong, as whisper-tiny on a young reader might produce. */
export const CAMP_HALF_WRONG = 'Sam in Pam want to cap. A cap they slap in a ten. The ten was read and hat a flat. At nine the win hit the flat. Flap flap flap went the ten. Sam did not lie the sand. Pam sad it is just the win. Go to sheep. So Sam when to sheep. In the mourning the son was up and the win was gone. Sam and Pam run to the lay can had a swim. It was the bass trip yes.';
