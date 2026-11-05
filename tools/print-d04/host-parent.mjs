// Only DPAPI with a synthetic string. No RAW operation and no printer lookup.
import { WindowsSpooler } from '../omni-print-agent/spooler-windows.mjs'
import { inspectProcess } from '../omni-print-agent/runtime.mjs'
const dir=process.argv[2], owner=await inspectProcess(process.pid)
const sp=new WindowsSpooler({dir,registryFile:dir+'/journal.jsonl.hosts.jsonl',parentStarted:owner.started})
await sp.protect('synthetic-watch-parent-only')
process.send({ready:true,hostPid:sp.host.pid})
setInterval(()=>{},1000)
