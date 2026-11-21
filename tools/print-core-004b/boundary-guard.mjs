import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
/** The PG native library is the only allowed DB connection, validated separately by lab.mjs. */
export function forbidRealTransports(){
 const attempts=[],undo=[];
 const replace=(object,key,kind)=>{
  const old=object[key];if(typeof old!=='function')return;
  object[key]=function(){attempts.push({kind});throw new Error('REAL_TRANSPORT_PROHIBITED:'+kind);};
  undo.push(()=>{object[key]=old;});
 };
 replace(globalThis,'fetch','fetch');
 replace(globalThis,'WebSocket','WebSocket');
 replace(net.Socket.prototype,'connect','node-net');
 replace(http,'request','node-http');replace(http,'get','node-http-get');
 replace(https,'request','node-https');replace(https,'get','node-https-get');
 replace(dgram,'createSocket','node-dgram');
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(childProcess,key,'child-process-'+key);
 return {attempts,restore(){for(const f of undo.reverse())f();}};
}
