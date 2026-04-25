import { afterAll, describe, expect, it } from 'bun:test';

const spkPath = '.pirate-claw/synology-spk/pirate-claw.spk';

async function run(args: string[]): Promise<string> {
  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `${args.join(' ')} failed with exit ${exitCode}\n${stdout}\n${stderr}`,
    );
  }

  return stdout;
}

describe('Synology SPK package', () => {
  afterAll(async () => {
    await run(['rm', '-rf', '.pirate-claw/synology-spk/test-extract']);
  });

  it('builds an installable package with DSM launcher metadata', async () => {
    const output = await run(['tools/synology-spk/build-spk.sh']);
    expect(output.trim()).toEndWith(spkPath);

    const contents = await run(['tar', '-tf', spkPath]);
    expect(contents).toContain('INFO');
    expect(contents).toContain('package.tgz');
    expect(contents).toContain('scripts/start-stop-status');
    expect(contents).toContain('conf/privilege');
    expect(contents).toContain('PACKAGE_ICON.PNG');
    expect(contents).toContain('PACKAGE_ICON_256.PNG');

    const info = await Bun.file('tools/synology-spk/INFO').text();
    expect(info).toContain('dsmuidir="PirateClaw:ui"');
    expect(info).toContain('dsmappname="com.pirateclaw.Launcher"');
    expect(info).toContain('install_dep_packages="Docker"');
  });

  it('packages compose, launcher UI, and icon sizes inside package.tgz', async () => {
    await run(['tools/synology-spk/build-spk.sh']);
    await run(['mkdir', '-p', '.pirate-claw/synology-spk/test-extract']);
    await run([
      'tar',
      '-C',
      '.pirate-claw/synology-spk/test-extract',
      '-xf',
      spkPath,
      'package.tgz',
    ]);

    const inner = await run([
      'tar',
      '-tzf',
      '.pirate-claw/synology-spk/test-extract/package.tgz',
    ]);
    expect(inner).toContain('./synology/compose.synology.yml');
    expect(inner).toContain('./ui/config');
    expect(inner).toContain('./ui/index.html');
    for (const size of [16, 24, 32, 48, 64, 72, 256]) {
      expect(inner).toContain(`./ui/images/icon_${size}.png`);
    }
  });

  it('does not attempt Docker orchestration from SPK hooks', async () => {
    const startStop = await Bun.file(
      'tools/synology-spk/scripts/start-stop-status',
    ).text();

    expect(startStop).toContain('mkdir -p');
    expect(startStop).toContain('compose.synology.yml');
    expect(startStop).not.toContain('docker ');
    expect(startStop).not.toContain('docker-compose');
    expect(startStop).not.toContain('compose up');
  });

  it('registers an admin-only DSM launcher with a port 8888 entrypoint', async () => {
    const config = await Bun.file('tools/synology-spk/ui/config').json();
    const launcher = config['.url']['com.pirateclaw.Launcher'];

    expect(launcher.title).toBe('Pirate Claw');
    expect(launcher.url).toBe('3rdparty/PirateClaw/index.html');
    expect(launcher.allUsers).toBeUndefined();

    const page = await Bun.file('tools/synology-spk/ui/index.html').text();
    expect(page).toContain('http://${host}:8888/');
    expect(page).toContain('DSM 7.1 Docker GUI first run');
  });
});
