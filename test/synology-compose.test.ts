import { describe, expect, it } from 'bun:test';

const baselineCompose = await Bun.file('compose.synology.yml').text();
const containerManagerCompose = await Bun.file(
  'compose.synology.cm.yml',
).text();

describe('Synology compose artifacts', () => {
  for (const [name, content] of [
    ['compose.synology.yml', baselineCompose],
    ['compose.synology.cm.yml', containerManagerCompose],
  ] as const) {
    it(`${name} defines the three-service DSM stack`, () => {
      expect(content).toContain('pirate-claw-web:');
      expect(content).toContain('pirate-claw-daemon:');
      expect(content).toContain('transmission:');
      expect(content).toContain(
        'PIRATE_CLAW_API_URL: http://pirate-claw-daemon:5555',
      );
      expect(content).toContain(
        'PIRATE_CLAW_TRANSMISSION_URL: http://transmission:9091/transmission/rpc',
      );
      expect(content).toContain('PUID: ${PIRATE_CLAW_TRANSMISSION_PUID:-0}');
      expect(content).toContain('PGID: ${PIRATE_CLAW_TRANSMISSION_PGID:-0}');
      expect(content).not.toContain('WHITELIST:');
    });

    it(`${name} exposes only the Pirate Claw web port`, () => {
      expect(content).toContain("'8888:8888'");
      expect(content).not.toContain('"5555:5555"');
      expect(content).not.toContain("'5555:5555'");
      expect(content).not.toContain('"9091:9091"');
      expect(content).not.toContain("'9091:9091'");
    });

    it(`${name} sources the write token from the generated config file`, () => {
      expect(content).toContain(
        '/volume1/pirate-claw/config/generated/daemon-api-write-token',
      );
      expect(content).toContain('cat "$$PIRATE_CLAW_DAEMON_TOKEN_FILE"');
      expect(content).not.toContain('PIRATE_CLAW_API_WRITE_TOKEN:');
    });
  }

  it('marks the DSM 7.2+ Container Manager artifact as validation pending', () => {
    expect(containerManagerCompose).toContain(
      'Validation status: pending external DSM 7.2+ tester verification.',
    );
  });
});
