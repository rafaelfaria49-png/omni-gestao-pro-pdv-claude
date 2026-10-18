import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export default defineConfig({resolve:{alias:{'@':root,'server-only':resolve(root,'test/server-only.ts')}},test:{environment:'node',include:['test/ops-v4-fluxo-curto-002/garantia-pg.test.ts'],testTimeout:30000}});
