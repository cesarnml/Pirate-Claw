import { afterAll, describe, expect, it } from 'bun:test';

const version = (await Bun.file('package.json').json()).version as string;
const bundlePath = `.pirate-claw/synology-release/pirate-claw-synology-v${version}.zip`;

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
    await run(['mkdir', '-p', '.pirate-claw/synology-release/images']);
    await Bun.write(
      `.pirate-claw/synology-release/images/pirate-claw-image-v${version}.tar`,
      'fixture daemon image tarball',
    );
    await Bun.write(
      `.pirate-claw/synology-release/images/pirate-claw-web-image-v${version}.tar`,
      'fixture web image tarball',
    );
    await Bun.write(
      `.pirate-claw/synology-release/images/transmission-image-v${version}.tar`,
      'fixture transmission image tarball',
    );
  }

  afterAll(async () => {
    await run(['rm', '-rf', '.pirate-claw/synology-release/test-extract']);
  });

  it('assembles the expected DSM-first release zip structure', async () => {
    await writeFixtureTarballs();

    const output = await run([
      'tools/synology-release/build-release-bundle.sh',
    ]);
    expect(output.trim()).toEndWith(bundlePath);

    const contents = await run(['unzip', '-Z1', bundlePath]);
    expect(contents).not.toContain('pirate-claw.spk');
    expect(contents).toContain(`images/pirate-claw-image-v${version}.tar`);
    expect(contents).toContain(`images/pirate-claw-web-image-v${version}.tar`);
    expect(contents).toContain(`images/transmission-image-v${version}.tar`);
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
        'tools/synology-release/README-synology-install.md',
        'tools/synology-release/install-dsm-7.1-docker.md',
        'tools/synology-release/install-dsm-7.2-container-manager.md',
      ].map((path) => Bun.file(path).text()),
    );
    const combined = docs.join('\n');

    expect(combined).toContain('Package Center');
    expect(combined).toContain('File Station');
    expect(combined).toContain('Add from file');
    expect(combined).toContain(
      'Do not pull Transmission from Registry for the Phase 27 validation path',
    );
    expect(combined).toContain(
      'DSM may display the image using its upstream registry tag',
    );
    expect(combined).toContain('`PUID` = `0`');
    expect(combined).toContain('`PGID` = `0`');
    expect(combined).toContain(
      'Do not set Transmission `USER`, `PASS`, or `WHITELIST`',
    );
    expect(combined).toContain(
      'Validation status: pending external DSM 7.2+ tester verification.',
    );
    expect(combined).not.toContain('docker run');
    expect(combined).not.toContain('docker compose');
    expect(combined).not.toContain('chmod');
    expect(combined).not.toContain('chown');
  });
});
