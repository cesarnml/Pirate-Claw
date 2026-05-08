import { afterAll, describe, expect, it } from 'bun:test';

const version = (await Bun.file('package.json').json()).version as string;
const synologyReleaseDir = 'releases/phase-28/synology-release';
const bundleOutputDir = '.pirate-claw/phase-28/synology-release';
const bundlePath = `${bundleOutputDir}/pirate-claw-synology-v${version}.zip`;
const abandonedPackageName = ['pirate-claw', 'spk'].join('.');

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

describe('Synology release bundle', () => {
  async function writeFixtureTarballs() {
    await run(['mkdir', '-p', `${bundleOutputDir}/images`]);
    await Bun.write(
      `${bundleOutputDir}/images/pirate-claw-image-v${version}.tar`,
      'fixture daemon image tarball',
    );
    await Bun.write(
      `${bundleOutputDir}/images/pirate-claw-web-image-v${version}.tar`,
      'fixture web image tarball',
    );
    await Bun.write(
      `${bundleOutputDir}/images/transmission-image-v${version}.tar`,
      'fixture transmission image tarball',
    );
  }

  afterAll(async () => {
    await run(['rm', '-rf', `${bundleOutputDir}/test-extract`]);
  });

  it('assembles the expected DSM-first release zip structure', async () => {
    await writeFixtureTarballs();

    const output = await run([`${synologyReleaseDir}/build-release-bundle.sh`]);
    expect(output.trim()).toEndWith(bundlePath);

    const contents = await run(['unzip', '-Z1', bundlePath]);
    expect(contents).not.toContain(abandonedPackageName);
    expect(contents).toContain(`images/pirate-claw-image-v${version}.tar`);
    expect(contents).toContain(`images/pirate-claw-web-image-v${version}.tar`);
    expect(contents).toContain(`images/transmission-image-v${version}.tar`);
    expect(contents).toContain('compose.synology.yml');
    expect(contents).toContain('compose.synology.cm.yml');
    expect(contents).toContain('README-synology-install.md');
    expect(contents).toContain('install-dsm-7.1-docker.md');
    expect(contents).toContain('install-dsm-7.2-container-manager.md');
    expect(contents).toContain('screenshots/dsm-7.1-docker/README.md');
    expect(contents).toContain(
      'screenshots/dsm-7.2-container-manager/README.md',
    );
  });

  it('keeps bundle install docs inside the DSM GUI-only owner contract', async () => {
    const docs = await Promise.all(
      [
        `${synologyReleaseDir}/README-synology-install.md`,
        `${synologyReleaseDir}/install-dsm-7.1-docker.md`,
        `${synologyReleaseDir}/install-dsm-7.2-container-manager.md`,
      ].map((path) => Bun.file(path).text()),
    );
    const combined = docs.join('\n');

    expect(combined).toContain('File Station');
    expect(combined).toContain('`images/pirate-claw-image-v');
    expect(combined).toContain('`images/pirate-claw-web-image-v');
    expect(combined).toContain('`images/transmission-image-v');
    expect(combined).toContain('Enable auto-restart.');
    expect(combined).toContain(
      'Do not use phase-specific image tags for Phase 28 validation.',
    );
    expect(combined).toContain('lscr.io/linuxserver/transmission:latest');
    expect(combined).toContain('`PUID` = `0`');
    expect(combined).toContain('`PGID` = `0`');
    expect(combined).toContain(
      'Do not set Transmission `USER`, `PASS`, or `WHITELIST`',
    );
    expect(combined).toContain(
      'Validation status: pending DSM 7.2+ tester verification.',
    );
    expect(combined).not.toContain(abandonedPackageName);
    expect(combined).not.toContain('docker run');
    expect(combined).not.toContain('docker compose');
    expect(combined).not.toContain('chmod');
    expect(combined).not.toContain('chown');
  });
});
