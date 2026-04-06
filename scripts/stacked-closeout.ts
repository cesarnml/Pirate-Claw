import { runStackedCloseout } from '../tools/delivery/stacked-closeout';

const exitCode = await runStackedCloseout(process.argv.slice(2), process.cwd());
process.exit(exitCode);
