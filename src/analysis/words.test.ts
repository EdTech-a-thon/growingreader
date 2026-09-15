import { countWords, tokenize } from './words';

describe('countWords', () => {
  test('splits on whitespace', () => {
    expect(countWords('The cat sat on the mat')).toBe(6);
  });

  test('counts a hyphenated token as one word', () => {
    expect(countWords('a well-known short-cut')).toBe(3);
  });

  test('ignores punctuation-only tokens and surrounding punctuation', () => {
    expect(countWords('"Stop!" she said — then left...')).toBe(5);
  });

  test('handles newlines and repeated spaces', () => {
    expect(countWords('one  two\n\nthree\tfour')).toBe(4);
  });

  test('empty text counts zero', () => {
    expect(countWords('   \n ')).toBe(0);
  });
});

describe('tokenize', () => {
  test('lowercases, strips punctuation and splits hyphens for alignment', () => {
    expect(tokenize('The well-known Cat, sat.')).toEqual(['the', 'well', 'known', 'cat', 'sat']);
  });

  test('keeps apostrophes inside words', () => {
    expect(tokenize("Don't stop")).toEqual(["don't", 'stop']);
  });
});
