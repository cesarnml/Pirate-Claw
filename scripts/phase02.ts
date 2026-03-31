import { runPhase02Orchestrator } from '../src/phase02-orchestrator';

const exitCode = await runPhase02Orchestrator(Bun.argv.slice(2), process.cwd());
process.exit(exitCode);
