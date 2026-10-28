import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target=path.join(root,specifier.slice(2));
    return nextResolve(pathToFileURL(fs.existsSync(target)?target:target+'.ts').href,context);
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const target=fileURLToPath(new URL(specifier,context.parentURL));
    if (!fs.existsSync(target) && fs.existsSync(target+'.ts')) return nextResolve(pathToFileURL(target+'.ts').href,context);
  }
  return nextResolve(specifier,context);
}});
const { canAccessPage }=await import(pathToFileURL(path.join(root,'lib/auth/page-access.ts')).href);
const { getPermissionsFromSession }=await import(pathToFileURL(path.join(root,'lib/auth/enterprise-permissions.ts')).href);
const { enterpriseDashboardRedirect }=await import(pathToFileURL(path.join(root,'lib/auth/proxy-enterprise-dashboard.ts')).href);
const { MODULES }=await import(pathToFileURL(path.join(root,'lib/auth/access-policy.ts')).href);
const session={user:{id:'synthetic-scope-diagnostic',name:'Synthetic',email:'scope@example.invalid',role:'OPERADOR',accessScope:'STORE',platformAuthority:false,lojaId:'loja-a',storeAccess:'restricted',allowedStoreIds:['loja-a','loja-b'],storeModules:{'loja-a':[...MODULES],'loja-b':[...MODULES]}},expires:'2099-01-01T00:00:00.000Z'};
const perms=getPermissionsFromSession(session,'loja-a');
const results=[];
for(const pathname of ['/dashboard/pessoas','/dashboard/pessoas/funcionarios','/dashboard/pessoas/configuracoes','/dashboard/unidades','/dashboard/plataforma','/dashboard/financeiro','/dashboard/pessoas-extra']){
 const redirect=enterpriseDashboardRedirect('https://synthetic.example.invalid',pathname,session,'loja-a');
 results.push({pathname,pageAccess:canAccessPage(perms,pathname),consumerRedirect:redirect?redirect.pathname+redirect.search:null});
}
const blocked=results.filter(r=>r.pathname.startsWith('/dashboard/pessoas/')&&r.pageAccess&&r.consumerRedirect);
const output={kind:'ACTUAL_PURE_AUTH_CONSUMER_DIAGNOSTIC_NOT_E2E',node:process.version,role:session.user.role,accessScope:session.user.accessScope,platformAuthority:false,globalSettingsPermission:perms.admin.configuracoes,results,blockedByOutOfAllowlistConsumer:blocked,gate:blocked.length?'OUT_OF_ALLOWLIST_AUTH_CONSUMER':'NONE',historicalE2eCause:'HYPOTHESIS',networkOrDatabaseUsed:false};
fs.writeFileSync(path.join(root,'docs/ai-execution/_evidence/PESSOAS-DP-FRONTEND-001B-RECOVERY-002/auth-consumer-diagnostic.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));