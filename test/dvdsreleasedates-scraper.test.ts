import { describe, expect, it, spyOn } from 'bun:test';

import {
  parseTopMoviesHtml,
  scrapeTopMovies,
} from '../src/dvdsreleasedates/scraper';

// A trimmed two-entry excerpt of the real markup shape confirmed live
// against dvdsreleasedates.com/top-movies-2026/ while building this
// feature — verified against the live 100-entry page to parse cleanly
// before this fixture was written.
const TWO_ENTRY_HTML = `
<table class='fieldtable-inner'><tr><td colspan='5' class='reldate'><h1>Top Movies 2026</h1></td></tr><tr><td class='dvdcell'>1<br/><a href='/movies/11346/spider-man-brand-new-day'><img class='movieimg' alt='Spider-Man: Brand New Day DVD Release Date' title='Spider-Man: Brand New Day DVD Release Date' src='/posters/110/S/Spider-Man-Brand-New-Day-2026.jpg'/></a><br/><a style='color:#000;' href='/movies/11346/spider-man-brand-new-day'>Spider-Man: Brand New Day</a><br/><table class='celldiscs'><tr><td class='imdblink left'>imdb: <a href='http://www.imdb.com/title/tt22084616/' target='_blank' rel='nofollow'>8.0</a></td><td class='imdblink right'>PG-13&nbsp;&nbsp;</td></tr></table><table class='celldiscs'><tr><td class='divcelldvd'><a class='bold' href='/movies/11346/spider-man-brand-new-day'>DVD</a>&#8202;&#8202;</td><td class='divcellbd'><a class='bold' href='/movies/11346/spider-man-brand-new-day'>Blu-ray</a>&#8202;&#8202;</td><td class='divcelldvd'><a class='bold' href='/movies/11346/spider-man-brand-new-day'>4K</a>&#8202;&#8202;</td></tr></table></td>
<td class='dvdcell'>2<br/><a href='/movies/12312/the-odyssey'><img class='movieimg' alt='The Odyssey DVD Release Date' title='The Odyssey DVD Release Date' src='/posters/123/T/The-Odyssey-2026.jpg'/></a><br/><a style='color:#000;' href='/movies/12312/the-odyssey'>The Odyssey</a><br/><table class='celldiscs'><tr><td class='imdblink left'>imdb: <a href='http://www.imdb.com/title/tt33764258/' target='_blank' rel='nofollow'>8.5</a></td><td class='imdblink right'>R&nbsp;&nbsp;</td></tr></table></td>
</tr></table>
`;

describe('parseTopMoviesHtml', () => {
  it('parses rank, title, IMDb id, and format flags from the real markup shape', () => {
    const entries = parseTopMoviesHtml(TWO_ENTRY_HTML);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      rank: 1,
      title: 'Spider-Man: Brand New Day',
      imdbId: 'tt22084616',
      formats: { dvd: true, bluray: true, fourK: true },
    });
    // No format table at all for this entry — every flag must default false,
    // not throw or leave a stale value from the previous entry's chunk.
    expect(entries[1]).toEqual({
      rank: 2,
      title: 'The Odyssey',
      imdbId: 'tt33764258',
      formats: { dvd: false, bluray: false, fourK: false },
    });
  });

  it('skips a malformed entry (missing an IMDb id) rather than throwing', () => {
    const brokenHtml = TWO_ENTRY_HTML.replace(
      "href='http://www.imdb.com/title/tt33764258/'",
      "href='http://www.imdb.com/title/'",
    );
    const entries = parseTopMoviesHtml(brokenHtml);
    expect(entries).toHaveLength(1);
    expect(entries[0].imdbId).toBe('tt22084616');
  });

  it('returns [] for markup with no dvdcell entries at all', () => {
    expect(
      parseTopMoviesHtml('<html><body>nothing here</body></html>'),
    ).toEqual([]);
  });

  it('decodes HTML entities in titles', () => {
    const html = TWO_ENTRY_HTML.replace(
      '>Spider-Man: Brand New Day</a>',
      '>Ocean&#39;s Eleven &amp; Friends</a>',
    );
    const entries = parseTopMoviesHtml(html);
    expect(entries[0].title).toBe("Ocean's Eleven & Friends");
  });
});

describe('scrapeTopMovies', () => {
  it('returns null on a non-200 response, best-effort with no retry', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('nope', { status: 503 })) as unknown as typeof fetch,
    );

    try {
      expect(await scrapeTopMovies(2026, () => {})).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns null on a network failure', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    );

    try {
      expect(await scrapeTopMovies(2026, () => {})).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('parses a real page response end to end', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(TWO_ENTRY_HTML, {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const entries = await scrapeTopMovies(2026, () => {});
      expect(entries).toHaveLength(2);
      expect(entries?.[0].title).toBe('Spider-Man: Brand New Day');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
