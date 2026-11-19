import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2]; const app = path.join(root,'src/app');
const walk = d => fs.readdirSync(d,{withFileTypes:true}).flatMap(e => e.isDirectory()? walk(path.join(d,e.name)) : [path.join(d,e.name)]);
const files = walk(app);
const metaSrc = fs.readFileSync(path.join(root,'src/lib/eventSectionMeta.ts'),'utf8');
const meta = {}; for (const m of metaSrc.matchAll(/\{ key: '([^']+)', label: '([^']+)', desc: '((?:[^'\\]|\\.)*)'.*?product: '(\w+)', group: '([^']+)'/g)) meta[m[1]] = {label:m[2],desc:m[3],product:m[4],group:m[5]};
// collect imports transitively one level into components to find table/api usage
const compDir = path.join(root,'src/components/portal');
const read = f => { try { return fs.readFileSync(f,'utf8'); } catch { return ''; } };
const importsOf = src => [...src.matchAll(/from '@\/components\/portal\/([A-Za-z/]+)'/g)].map(m=>path.join(compDir,m[1]+'.tsx'));
const usage = src => ({ tables:[...new Set([...src.matchAll(/\.from\('([a-z_]+)'\)/g)].map(m=>m[1]))], rpcs:[...new Set([...src.matchAll(/\.rpc\('([a-z_]+)'/g)].map(m=>m[1]))], apis:[...new Set([...src.matchAll(/[`'"](\/api\/[^`'"?]+)/g)].map(m=>m[1].replace(/\$\{[^}]+\}/g,'[param]')))] });
const merge = (a,b)=>({tables:[...new Set([...a.tables,...b.tables])].sort(),rpcs:[...new Set([...a.rpcs,...b.rpcs])].sort(),apis:[...new Set([...a.apis,...b.apis])].sort()});
const pages = files.filter(f=>f.endsWith('/page.tsx')).map(f=>{
  const rel = path.relative(root,f); const route = ('/'+path.relative(app,path.dirname(f))).replace(/\/$/,'') || '/';
  const src = read(f); let u = usage(src); const comps = importsOf(src);
  for (const c of comps) u = merge(u, usage(read(c)));
  const seg = route.match(/^\/portal\/events\/\[eventId\]\/([^/]+)$/)?.[1];
  const m = seg ? meta[seg] : null;
  const redirectOnly = /redirect\(|router\.replace\(/.test(src) && src.split('\n').length < 60;
  let scope = route.startsWith('/auth')||route==='/'||route==='/unauthorized' ? 'public' : route.startsWith('/portal/admin') ? 'platform-admin' : route.includes('[eventId]') ? 'event' : 'organization';
  return { route, file: rel, scope, section_key: seg ?? null, label: m?.label ?? null, group: m?.group ?? null, product: m?.product ?? null, purpose: m?.desc ?? null, lines: src.split('\n').length, redirect_only: redirectOnly, components: comps.map(c=>path.basename(c,'.tsx')).filter(c=>fs.existsSync(path.join(compDir,c+'.tsx'))), tables: u.tables, rpcs: u.rpcs, apis: u.apis, status: 'unverified-in-browser' };
}).sort((a,b)=>a.route.localeCompare(b.route));
const apis = files.filter(f=>f.endsWith('/route.ts')).map(f=>{ const src=read(f); return { route: '/'+path.relative(app,path.dirname(f)), file: path.relative(root,f), methods: [...src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)/g)].map(m=>m[1]), uses_service_role: /SERVICE_ROLE|plannerAdmin|createAdminClient|getPlannerAdmin|serviceRole/i.test(src), planner_db: /planner/i.test(f) || /plannerAdmin/.test(src), auth_checks: [...new Set([...src.matchAll(/\b(requirePlatformAdmin|resolvePlannerEventAccess|canAdministerPlannerPermissions|portal_is_global_admin|isGlobalAdmin|auth\.getUser|is_organization_admin|canManageOrgPeople|readCallerProfile|requireOrgAdmin|resolveCaller\w*)\b/g)].map(m=>m[1]))] }; }).sort((a,b)=>a.route.localeCompare(b.route));
fs.writeFileSync(path.join(root,'docs/bendie-revamp/data/routes.json'), JSON.stringify({ generated: new Date().toISOString().slice(0,10), source: 'derived from src/app/**/page.tsx, route.ts and src/lib/eventSectionMeta.ts', verification: 'SOURCE-CONFIRMED; no route browser-verified (no test account)', pages, api_routes: apis }, null, 2));
console.log(pages.length, apis.length);
for (const p of pages) console.log(p.route, p.lines, p.redirect_only?'REDIRECT':'', p.tables.join(','), '|', p.apis.length);
console.log('--api auth');
for (const a of apis) console.log(a.route, a.methods.join(','), a.uses_service_role?'SR':'', a.auth_checks.join(','));
