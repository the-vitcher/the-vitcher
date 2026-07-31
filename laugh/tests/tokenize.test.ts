import { describe, expect, it } from 'vitest';
import { isStopword, tokenize, uniqueTokens } from '../core/tokenize';

describe('tokenize', () => {
  it('lowercases and splits on punctuation', () => {
    expect(tokenize('Deadpan Sketch: The Interview!')).toEqual(['deadpan', 'sketch', 'interview']);
  });

  it('drops stopwords and YouTube filler', () => {
    expect(tokenize('The official full episode of a sketch')).toEqual(['sketch']);
  });

  it('drops short tokens and bare numbers', () => {
    expect(tokenize('a ok 42 2024 puppets')).toEqual(['puppets']);
  });

  it('keeps alphanumeric tokens that are not pure digits', () => {
    expect(tokenize('season2 finale')).toEqual(['season2', 'finale']);
  });

  it('handles apostrophes without splitting the word', () => {
    expect(tokenize("didn't")).toEqual(['didnt']);
  });

  it('returns an empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('the a of')).toEqual([]);
  });
});

describe('uniqueTokens', () => {
  it('de-duplicates within one document', () => {
    expect(uniqueTokens('puppets puppets puppets')).toEqual(['puppets']);
  });

  it('preserves first-seen order', () => {
    expect(uniqueTokens('sketch puppets sketch')).toEqual(['sketch', 'puppets']);
  });
});

describe('isStopword', () => {
  it('covers both the english stopwords and the YouTube filler', () => {
    expect(isStopword('the')).toBe(true);
    expect(isStopword('official')).toBe(true);
    expect(isStopword('deadpan')).toBe(false);
  });
});
