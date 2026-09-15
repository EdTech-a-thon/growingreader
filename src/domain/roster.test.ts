import { parseRoster, displayName } from './roster';

describe('parseRoster', () => {
  test('splits each line into first and last name on the first space', () => {
    expect(parseRoster('Ada Lovelace\nMary Anne Evans')).toEqual([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Mary', lastName: 'Anne Evans' },
    ]);
  });

  test('a single word is a first name with no last name', () => {
    expect(parseRoster('Cher')).toEqual([{ firstName: 'Cher', lastName: '' }]);
  });

  test('ignores blank lines and trims whitespace', () => {
    expect(parseRoster('  Ada Lovelace \n\n\nGrace Hopper\n')).toEqual([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' },
    ]);
  });
});

test('displayName joins first and last', () => {
  expect(displayName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace');
  expect(displayName({ firstName: 'Cher', lastName: '' })).toBe('Cher');
});
