// The analysis module: pure functions from data to data. Nothing here touches
// storage, the microphone or the model. See docs/adr/0002 for what the
// transcript may and may not be used for.
export { countWords, passageWords, tokenize } from './words';
export { trimSilence, speechOnsets, speechOffsets, playFrom } from './silence';
export { alignWords, type Emissions } from './ctc';
export { identifyPassage, passageSimilarity, IDENTIFY_FLOOR, IDENTIFY_MARGIN } from './identify';
export { alignToPassage, assessCompletion, refineTiming, COMPLETION_COVERAGE } from './align';
