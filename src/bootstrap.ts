export type SetupState = 'starter' | 'partially_configured' | 'ready';

export async function getSetupState(path: string): Promise<SetupState> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return 'starter';
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return 'partially_configured';
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return 'partially_configured';
  }

  const config = raw as Record<string, unknown>;

  if (config._starter === true) {
    return 'starter';
  }

  const feeds = config.feeds;
  const tv = config.tv;
  const transmission = config.transmission as
    | Record<string, unknown>
    | undefined;

  const feedsNonEmpty = Array.isArray(feeds) && feeds.length > 0;
  const transmissionUrlSet =
    typeof transmission?.url === 'string' && transmission.url.length > 0;

  if (!feedsNonEmpty || !transmissionUrlSet) {
    return 'partially_configured';
  }

  const mediaTypes = new Set(
    (feeds as Array<Record<string, unknown>>).map((f) => f.mediaType),
  );

  const tvComplete =
    !mediaTypes.has('tv') ||
    (Array.isArray(tv)
      ? tv.length > 0
      : typeof tv === 'object' &&
        tv !== null &&
        Array.isArray((tv as Record<string, unknown>).shows) &&
        ((tv as Record<string, unknown>).shows as unknown[]).length > 0);

  const movieComplete = !mediaTypes.has('movie') || config.movies !== undefined;

  if (tvComplete && movieComplete) {
    return 'ready';
  }

  return 'partially_configured';
}
export async function ensureStarterConfig(path: string): Promise<void> {
  const file = Bun.file(path);

  if (await file.exists()) {
    return;
  }

  const starter = {
    _starter: true,
    transmission: {
      url: 'http://localhost:9091/transmission/rpc',
      username: 'admin',
      password: 'admin',
    },
    plex: {
      url: 'http://localhost:32400',
      token: '',
      refreshIntervalMinutes: 0,
    },
    tv: {
      defaults: { resolutions: ['1080p'], codecs: ['x264'] },
      shows: [],
    },
    feeds: [],
  };

  await Bun.write(path, JSON.stringify(starter, null, 2) + '\n');
}
