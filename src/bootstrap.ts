export async function ensureStarterConfig(path: string): Promise<void> {
  const file = Bun.file(path);

  if (await file.exists()) {
    return;
  }

  const year = new Date().getFullYear();

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
      refreshIntervalMinutes: 30,
    },
    movies: {
      years: [year - 1, year],
      resolutions: ['1080p'],
      codecs: ['x264'],
      codecPolicy: 'prefer',
    },
    tv: {
      defaults: { resolutions: ['1080p'], codecs: ['x264'] },
      shows: [],
    },
    feeds: [],
  };

  await Bun.write(path, JSON.stringify(starter, null, 2) + '\n');
}
