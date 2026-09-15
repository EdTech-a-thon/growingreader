// The analysis module: pure functions from data to data. Nothing here touches
// storage, the microphone or the model. See docs/adr/0002 for what the
// transcript may and may not be used for.
export { countWords, tokenize } from './words';
export { trimSilence } from './silence';
export { identifyPassage, passageSimilarity, IDENTIFY_FLOOR, IDENTIFY_MARGIN } from './identify';
export { alignToPassage, assessCompletion, refineTiming, COMPLETION_COVERAGE } from './align';
