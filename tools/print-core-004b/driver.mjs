import { prepare, initCluster, provisionCluster, recordR03, recordR04, stopCluster } from './lab.mjs';
const action=process.argv[2];
if(action==='prepare') await prepare();
else if(action==='cluster-init') await initCluster();
else if(action==='cluster-resume') await provisionCluster();
else if(action==='R03') recordR03();
else if(action==='R04') recordR04();
else if(action==='stop') stopCluster();
else if(action==='gate-a') { const {gateA}=await import('./gate-a.mjs'); await gateA(); }
else if(action==='gate-a-final') { const {finalGateA}=await import('./gate-a-final.mjs'); await finalGateA(); }
else if(action==='gate-b') { const {gateB}=await import('./gate-b.mjs'); await gateB(); }
else if(action==='finalize') { const {finalize}=await import('./final-evidence.mjs'); finalize(); }
else if(action==='cases') { const {cases}=await import('./cases.mjs'); cases(); }
else if(action==='checks') { const {checks}=await import('./checks.mjs'); await checks(); }
else throw new Error('Unknown action');
