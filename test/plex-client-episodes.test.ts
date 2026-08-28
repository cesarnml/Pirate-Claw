import { describe, expect, it, spyOn } from 'bun:test';

import { PlexHttpClient } from '../src/plex/client';

// Fixture XML shaped exactly like a live GET /library/metadata/{ratingKey}/children
// response, captured against a real PMS (Star Trek: Strange New Worlds,
// ratingKey 35033) while building this feature — season 4 genuinely has
// leafCount=1 despite 6 episodes having aired per TMDB, the real-world gap
// this feature exists to surface.
const SEASONS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="4">
  <Metadata ratingKey="35034" type="season" index="1" title="Season 1" leafCount="10"/>
  <Metadata ratingKey="54031" type="season" index="2" title="Season 2" leafCount="10"/>
  <Metadata ratingKey="65782" type="season" index="3" title="Season 3" leafCount="10"/>
  <Metadata ratingKey="68673" type="season" index="4" title="Season 4" leafCount="1"/>
</MediaContainer>`;

const EPISODES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="3">
  <Metadata ratingKey="35035" type="episode" index="1" parentIndex="1" title="Strange New Worlds"/>
  <Metadata ratingKey="35037" type="episode" index="2" parentIndex="1" title="Children of the Comet"/>
  <Metadata ratingKey="35038" type="episode" index="3" parentIndex="1" title="Ghosts of Illyria"/>
</MediaContainer>`;

describe('PlexHttpClient season/episode children', () => {
  it('getShowSeasons parses seasons with their episode counts', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(SEASONS_XML, { status: 200 })) as unknown as typeof fetch,
    );

    try {
      const client = new PlexHttpClient(
        'http://localhost:32400',
        'tok',
        () => {},
      );
      const seasons = await client.getShowSeasons('35033');
      expect(seasons).toEqual([
        { ratingKey: '35034', seasonNumber: 1, episodeCount: 10 },
        { ratingKey: '54031', seasonNumber: 2, episodeCount: 10 },
        { ratingKey: '65782', seasonNumber: 3, episodeCount: 10 },
        { ratingKey: '68673', seasonNumber: 4, episodeCount: 1 },
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('getSeasonEpisodes parses episode number and title', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(EPISODES_XML, { status: 200 })) as unknown as typeof fetch,
    );

    try {
      const client = new PlexHttpClient(
        'http://localhost:32400',
        'tok',
        () => {},
      );
      const episodes = await client.getSeasonEpisodes('35034');
      expect(episodes).toEqual([
        { episodeNumber: 1, title: 'Strange New Worlds' },
        { episodeNumber: 2, title: 'Children of the Comet' },
        { episodeNumber: 3, title: 'Ghosts of Illyria' },
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('parses episodes tagged <Video> too, not just <Metadata>/<Directory>', async () => {
    // Confirmed live: a partial season (Star Trek: Strange New Worlds season
    // 4, one aired episode downloaded) came back with its single episode
    // wrapped in <Video>, not <Metadata> — the same "flat listing" shape
    // /library/sections/*/all uses for movies. Missing this case silently
    // dropped the episode entirely, making a season that genuinely had one
    // episode in Plex read as fully missing.
    const videoTaggedXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1">
  <Video ratingKey="68674" type="episode" index="6" parentIndex="4" title="Off-Hour"/>
</MediaContainer>`;
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(videoTaggedXml, {
          status: 200,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new PlexHttpClient(
        'http://localhost:32400',
        'tok',
        () => {},
      );
      const episodes = await client.getSeasonEpisodes('68673');
      expect(episodes).toEqual([{ episodeNumber: 6, title: 'Off-Hour' }]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns null (not []) on a failed request, so callers can distinguish "unreachable" from "no seasons"', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response('unauthorized', {
          status: 401,
        })) as unknown as typeof fetch,
    );

    try {
      const client = new PlexHttpClient(
        'http://localhost:32400',
        'tok',
        () => {},
      );
      expect(await client.getShowSeasons('35033')).toBeNull();
      expect(await client.getSeasonEpisodes('35034')).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
