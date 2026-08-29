import { describe, expect, it } from 'bun:test';
import { XMLParser } from 'fast-xml-parser';

import {
  plexMovieSearchResultsFromContainer,
  plexShowSearchResultsFromContainer,
  videoEntryToShowSearchCandidate,
} from '../src/plex/client';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

describe('plex search XML (hub-aware)', () => {
  it('reads TV shows nested under Hub Directory (PMS hub-style search)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
  <Hub title="TV Shows" type="show" hubIdentifier="show" size="1">
    <Directory ratingKey="999" title="The Pitt" type="show" year="2025" viewCount="3"/>
  </Hub>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexShowSearchResultsFromContainer
    >[0];
    const results = plexShowSearchResultsFromContainer(container);
    expect(results).toEqual([
      {
        ratingKey: '999',
        title: 'The Pitt',
        type: 'show',
        year: 2025,
        viewCount: 3,
        lastViewedAt: undefined,
      },
    ]);
  });

  it('still reads flat MediaContainer Directory (legacy search)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
  <Directory ratingKey="111" title="Example Show" type="show"/>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexShowSearchResultsFromContainer
    >[0];
    expect(plexShowSearchResultsFromContainer(container)).toEqual([
      {
        ratingKey: '111',
        title: 'Example Show',
        type: 'show',
        year: undefined,
        viewCount: undefined,
        lastViewedAt: undefined,
      },
    ]);
  });

  it('treats section /all movie libraries as Video rows (not Directory)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1" totalSize="1" offset="0" viewGroup="movie">
  <Video ratingKey="10" type="movie" title="The Gates" year="2026" viewCount="2"/>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexMovieSearchResultsFromContainer
    >[0];
    expect(plexMovieSearchResultsFromContainer(container)).toEqual([
      {
        ratingKey: '10',
        title: 'The Gates',
        type: 'movie',
        year: 2026,
        viewCount: 2,
        lastViewedAt: undefined,
      },
    ]);
  });

  it('reads movies nested under Hub Video', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
  <Hub title="Movies" type="movie" hubIdentifier="movie" size="1">
    <Video ratingKey="222" title="Example Film" type="movie" year="2024" viewCount="1"/>
  </Hub>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexMovieSearchResultsFromContainer
    >[0];
    expect(plexMovieSearchResultsFromContainer(container)).toEqual([
      {
        ratingKey: '222',
        title: 'Example Film',
        type: 'movie',
        year: 2024,
        viewCount: 1,
        lastViewedAt: undefined,
      },
    ]);
  });

  it('maps episode Video rows to grandparent show for matching', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
  <Hub title="Episodes" type="episode" size="1">
    <Video ratingKey="ep1" type="episode" title="9:00 P.M."
      grandparentTitle="The Pitt" grandparentRatingKey="555" parentYear="2026"/>
  </Hub>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexShowSearchResultsFromContainer
    >[0];
    expect(plexShowSearchResultsFromContainer(container)).toEqual([
      {
        ratingKey: '555',
        title: 'The Pitt',
        type: 'show',
        year: 2026,
        viewCount: undefined,
        lastViewedAt: undefined,
      },
    ]);
  });

  it('maps numeric Plex episode type to grandparent show', () => {
    expect(
      videoEntryToShowSearchCandidate({
        type: 4,
        grandparentTitle: 'The Pitt',
        grandparentRatingKey: '777',
        parentYear: '2025',
      }),
    ).toMatchObject({
      ratingKey: '777',
      title: 'The Pitt',
      type: 'show',
      year: 2025,
    });
  });

  it('parses tmdb:// and imdb:// Guid children onto the search result (includeGuids=1 shape)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
  <Video ratingKey="1" type="movie" title="The Odyssey" year="2026">
    <Guid id="tmdb://942353"/>
    <Guid id="imdb://tt22084616"/>
    <Guid id="tvdb://123456"/>
  </Video>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexMovieSearchResultsFromContainer
    >[0];
    const [result] = plexMovieSearchResultsFromContainer(container);
    expect(result.tmdbId).toBe(942353);
    expect(result.imdbId).toBe('tt22084616');
  });

  it('leaves tmdbId/imdbId undefined when no Guid children are present', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
  <Video ratingKey="1" type="movie" title="The Odyssey" year="2026"/>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexMovieSearchResultsFromContainer
    >[0];
    const [result] = plexMovieSearchResultsFromContainer(container);
    expect(result.tmdbId).toBeUndefined();
    expect(result.imdbId).toBeUndefined();
  });

  it('dedupes the same ratingKey from top-level and hub shelves', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="2">
  <Directory ratingKey="1" title="Same" type="show"/>
  <Hub title="TV Shows" type="show" size="1">
    <Directory ratingKey="1" title="Same" type="show"/>
  </Hub>
</MediaContainer>`;
    const container = parser.parse(xml) as Parameters<
      typeof plexShowSearchResultsFromContainer
    >[0];
    expect(plexShowSearchResultsFromContainer(container)).toHaveLength(1);
  });
});
