// What whisper-tiny.en (the app's own recogniser) heard in the demo recordings from
// scripts/make-demo-audio.sh, captured from the app: `word@start-end`, seconds. Kept as its
// real mistakes, since those are what marking has to catch: on Ada's second reading it
// ran "Sam and" together as "Salmon", and on Marcus's it heard his "duck" and "cap tin"
// as the passage's "dock" and "captain", as the recogniser does when a misreading is close.
import type { Transcript } from '../domain/types';

const HEARD: Record<string, string> = {
  'ada-camp-1':
    'Sam@0.38-0.58 and@0.58-0.86 Pam@0.86-1.10 went@1.10-1.40 to@1.40-1.74 camp.@1.74-2.06 At@2.24-2.54 camp@2.54-2.82 they@2.82-3.06 slept@3.06-3.24 in@3.24-3.48 the@3.48-3.78 tent.@3.78-4.02 The@4.22-4.48 tent@4.48-4.72 was@4.72-4.90 red@4.90-5.08 and@5.08-5.24 had@5.24-5.38 a@5.38-5.76 flap.@5.76-5.98 At@6.24-6.50 night@6.50-6.68 the@6.68-6.86 wind@6.86-7.06 hit@7.06-7.30 the@7.30-7.60 flip.@7.60-8.16 Flap,@8.42-8.94 flap,@9.28-9.64 flap,@10.02-10.34 flap@10.54-10.82 went@10.82-11.08 the@11.08-11.44 tent.@11.44-11.80 Sam@12.04-12.30 did@12.30-12.56 not@12.56-12.68 like@12.78-12.78 the@13.06-13.38 sound.@13.38-13.74 Pam@13.98-14.40 said,@14.40-14.56 It@14.74-14.94 is@14.94-15.22 just@15.22-15.42 the@15.42-15.68 wind.@15.68-15.98 Go@16.16-16.44 to@16.44-16.78 sleep.@16.78-17.18 So@17.40-17.72 Sam@17.72-17.96 went@17.96-18.18 to@18.18-18.46 bed.@18.46-18.62 In@18.84-19.02 the@19.02-19.16 morning@19.26-19.26 the@19.50-19.68 sun@19.68-19.92 was@19.92-20.08 up@20.08-20.24 and@20.24-20.38 the@20.38-20.54 wind@20.54-20.78 was@20.78-21.18 gone.@21.18-21.52 Sam@21.78-22.22 and@22.22-22.26 Pam@22.26-22.54 ran@22.54-22.68 to@22.68-22.86 the@22.86-23.02 lake@23.02-23.20 and@23.20-23.34 had@23.34-23.56 a@23.56-23.86 swim.@23.86-24.00 It@24.24-24.36 was@24.52-25.38 the@24.60-24.96 best@24.96-25.24 trip@25.24-27.04 yet.@27.04-29.98',
  'ada-camp-2':
    'Salmon@0.48-0.86 Pam@0.86-1.10 went@1.10-1.38 to@1.38-1.74 camp,@1.74-2.04 at@2.26-2.54 camp@2.54-2.84 they@2.84-3.08 slept@3.08-3.26 in@3.26-3.54 a@3.54-3.76 tent.@3.76-3.96 The@4.26-4.48 tent@4.48-4.76 was@4.76-5.04 rod.@5.04-5.60 Red@5.82-5.98 and@5.98-6.12 had@6.12-6.32 a@6.32-6.66 flap.@6.66-6.96 At@7.14-7.40 night@7.40-7.58 the@7.58-7.78 wind@7.78-7.98 hit@7.98-8.22 the@8.22-8.52 flap.@8.52-8.96 Flap,@9.16-9.68 flap,@10.04-10.36 flap@10.64-10.86 went@10.86-11.12 the@11.12-11.44 tent.@11.44-11.80 Sam@12.06-12.36 did@12.36-12.66 not.@12.66-12.98 Did@13.20-13.46 not@13.46-13.70 like@13.70-13.94 the@13.94-14.14 sound@14.14-14.30 and@14.30-14.48 the@14.48-14.60 wind@14.60-14.86 was@14.86-15.26 gone.@15.26-15.62 Salmon@16.00-16.36 Pam@16.36-16.62 ran@16.62-16.80 to@16.80-17.04 the.@17.04-18.26 Pondon@21.20-21.56 had@21.56-21.78 a@21.78-22.14 swim.@22.14-22.26 It@22.48-22.74 was@22.74-22.88 the@22.88-23.18 best@23.18-23.44 trip@23.44-23.76 yet.@24.04-25.24',
  'marcus-ship':
    'The@0.24-0.48 ships@0.48-0.74 sat@0.74-0.90 in@0.90-1.12 the@1.12-1.36 dock,@1.36-1.68 men@1.90-2.14 ran@2.14-2.34 up@2.34-2.54 the@2.54-2.84 plank@2.84-3.10 with@3.10-3.42 sacks@3.42-3.66 and@3.66-3.92 kegs.@3.92-4.32 The@4.66-4.98 captain@4.98-5.38 stood@5.38-5.58 on@5.58-5.74 the@5.74-5.92 deck@5.92-6.18 and@6.18-6.42 shouted@6.42-6.70 at@6.70-6.84 them@6.84-7.04 to@7.04-7.24 be@7.24-7.56 quick.@7.56-7.76 A@8.04-8.24 gull@8.24-8.46 sat@8.46-8.66 on@8.66-8.98 the@8.98-9.04 mast@9.04-9.28 and@9.28-9.50 did@9.50-9.74 not@9.74-10.12 move.@10.12-10.38 When@10.56-10.78 the@10.78-11.06 last@11.06-11.32 sack@11.32-11.54 was@11.54-11.72 on@11.72-11.94 the@11.94-12.16 ship,@12.16-12.38 the@12.58-12.78 men@12.78-13.00 pulled@13.00-13.24 up@13.24-13.48 the@13.48-13.88 plank.@13.88-14.06 The@14.32-14.62 ships@14.62-14.86 lit@14.86-15.06 out@15.06-15.26 of@15.26-15.36 the@15.36-15.62 dock@15.62-15.82 and@15.82-16.04 into@16.04-16.28 the@16.28-16.56 bay.@16.56-16.78 The@17.06-17.20 gulls@17.20-17.60 still@17.60-17.80 sat@17.80-17.98 on@17.98-18.18 the@18.18-18.36 mast@18.36-18.58 as@18.58-18.78 the@18.78-19.00 land@19.00-19.30 slipped@19.30-19.66 away@19.66-20.04 behind@20.04-20.32 them.@20.90-22.14',
};

/** The recogniser's transcript of a demo recording, by its audio file's name. */
export function demoTranscript(audio: string): Transcript | undefined {
  const heard = HEARD[audio];
  if (!heard) return undefined;
  const words = heard.split(' ').map((w) => {
    const [text, times] = w.split('@');
    const [start, end] = times.split('-').map(Number);
    return { text, start, end };
  });
  return { text: words.map((w) => w.text).join(' '), words };
}
