import { identifyPassage, passageSimilarity } from './identify';
import { tokenize } from './words';
import { CAMP_CLEAN, CAMP_HALF_WRONG, CAMP_STOPS_EARLY, CAMP_TEXT, CAMP_TEXT_VARIANT, SHIP_TEXT } from '../test/fixtures/passages';

const camp = { id: 'camp', text: CAMP_TEXT };
const ship = { id: 'ship', text: SHIP_TEXT };
const campVariant = { id: 'camp2', text: CAMP_TEXT_VARIANT };

describe('identifyPassage', () => {
  test('a clean read is auto-assigned to its passage', () => {
    const result = identifyPassage(tokenize(CAMP_CLEAN), [ship, camp]);
    expect(result.autoAssigned).toBe(true);
    expect(result.candidates[0].passageId).toBe('camp');
  });

  test('a read that stops at 70% is still identified', () => {
    const result = identifyPassage(tokenize(CAMP_STOPS_EARLY), [ship, camp]);
    expect(result.autoAssigned).toBe(true);
    expect(result.candidates[0].passageId).toBe('camp');
  });

  test('a transcript with half the words wrong is still identified', () => {
    const result = identifyPassage(tokenize(CAMP_HALF_WRONG), [ship, camp]);
    expect(result.autoAssigned).toBe(true);
    expect(result.candidates[0].passageId).toBe('camp');
  });

  test('two near-identical passages are offered as candidates, not auto-assigned', () => {
    const result = identifyPassage(tokenize(CAMP_CLEAN), [ship, camp, campVariant]);
    expect(result.autoAssigned).toBe(false);
    expect(result.candidates.map((c) => c.passageId).slice(0, 2).sort()).toEqual(['camp', 'camp2']);
  });

  test('offers at most three candidates', () => {
    const many = [ship, camp, campVariant, { id: 'x', text: 'one two three' }];
    expect(identifyPassage(tokenize(CAMP_CLEAN), many).candidates.length).toBeLessThanOrEqual(3);
  });

  test('an unrelated transcript is not assigned to anything', () => {
    const result = identifyPassage(tokenize('twinkle twinkle little star how I wonder what you are'), [ship, camp]);
    expect(result.autoAssigned).toBe(false);
  });

  test('an empty passage list gives no candidates', () => {
    expect(identifyPassage(tokenize(CAMP_CLEAN), [])).toEqual({ candidates: [], autoAssigned: false });
  });
});

describe('passageSimilarity', () => {
  test('near copies score high, unrelated passages score low', () => {
    expect(passageSimilarity(CAMP_TEXT, CAMP_TEXT_VARIANT)).toBeGreaterThan(0.9);
    expect(passageSimilarity(CAMP_TEXT, SHIP_TEXT)).toBeLessThan(0.5);
  });
});
