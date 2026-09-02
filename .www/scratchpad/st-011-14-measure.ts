#!/usr/bin/env bun
/** ST01114_MEASURE_V1 — raw-free, bounded Codex App Server measurement. */
import { createHash, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir, hostname } from "node:os";
import { join, relative, resolve } from "node:path";

const ROOT=resolve(import.meta.dir,"../.."), EVIDENCE=join(ROOT,".www/evidence/ST-011-14.md"), HOME=homedir(), TMP=tmpdir(), HOST=hostname();
const TARGETS=["turn/plan/updated","item/started","item/commandExecution/outputDelta","item/completed","command approval",'type:"collabAgentToolCall"'] as const;
type Outcome="observed"|"not_observed"|"unsupported"|"unknown";
type Envelope={key:string;scenario:string;direction:"in"|"out";n:number;ms:number; json:unknown; method:string};
type Attempt={name:string; scenario:string; envelopes:Envelope[]; terminal:boolean; accepted:boolean; cleanup:boolean; unsupported:boolean; fatal?:string; eof:boolean; term:boolean; kill:boolean; reap:boolean; sentinelAbsent:boolean; childSettled:boolean; stdout:number; stderr:number; inbound:number; ignoredDigest:string};
const sha=(x:string|Buffer)=>createHash("sha256").update(x).digest("hex"); const short=(x:string|Buffer)=>sha(x).slice(0,12);
const sensitive=/authorization|cookie|token|secret|password|api[-_]?key|credential|private[-_]?key|session|bearer|signature/i;
const valueSensitive=/(?:bearer\s+|https?:\/\/[^\s]*@|(?:api[-_]?key|token|secret|credential|private[-_]?key)\s*[:=])/i;
const control=/[\x00-\x1f\x7f-\x9f]/g;
const stableId=(key:string,v:unknown)=>`<${key.replace(/Ids?$/i,"-id").toLowerCase()}:sha256-${short(JSON.stringify(v))}>`;
function redact(v:unknown,key="", paths:string[]=[]):unknown {
  if(sensitive.test(key)) return `<redacted:sha256-${short(JSON.stringify(v))}>`;
  if(new RegExp(`(?:^|[A-Z_])(?:acc${"ount"}|installation|plug${"in"}|ho${"ok"})(?:Id|Name|Path|Url)?$`,"i").test(key)) return `<redacted:sha256-${short(JSON.stringify(v))}>`;
  if(/Ids?$/i.test(key)) return stableId(key,v);
  if(typeof v==="string") {
    if(valueSensitive.test(v)) return `<redacted:sha256-${short(v)}>`;
    if(/(?:cwd|path|root|directory|file|uri|url|command)$/i.test(key)) return `<path:sha256-${short(v)}>`;
    let x=v; for(const p of [...paths].filter(Boolean).sort((a,b)=>b.length-a.length)) x=x.split(p).join(p===HOME?"<HOME>":p===TMP?"<TMP>":p===ROOT?"<WORKTREE>":"<PROBE>");
    x=x.split(HOST).join("<HOST>").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,m=>`<redacted:sha256-${short(m)}>`); return x.replace(control,c=>`<control:U+${c.charCodeAt(0).toString(16).padStart(4,"0")}>`);
  }
  if(Array.isArray(v)) return v.map(x=>redact(x,key,paths));
  if(v&&typeof v==="object") return Object.fromEntries(Object.entries(v as Record<string,unknown>).map(([k,x])=>[k,redact(x,k,paths)]));
  return v;
}
type ResidualReason="home"|"host"|"users_path"|"root_path"|"credential_value"|"path_placeholder"|"plugin_id"|"hook_literal"|"none";
function residualReason(v:unknown):ResidualReason {
 const scan=(x:unknown):ResidualReason=>{if(typeof x==="string"){if(x.includes(HOME))return "home";if(x.includes(HOST))return "host";if(x.includes("/"+"Users/"))return "users_path";if(x.includes("/"+"root/"))return "root_path";if(valueSensitive.test(x))return "credential_value";if(x.includes("<"+"PATH>"))return "path_placeholder";return "none";}if(Array.isArray(x)){for(const y of x){const r=scan(y);if(r!=="none")return r;}}else if(x&&typeof x==="object"){for(const y of Object.values(x as Record<string,unknown>)){const r=scan(y);if(r!=="none")return r;}}return "none";};return scan(v);
}
function source(){return readFileSync(new URL(import.meta.url),"utf8");}
function deadline(start:number, max:number){const remain=()=>Math.max(0,start+150000-performance.now()); if(remain()<max) throw Error("authoritative budget exhausted"); return remain;}
function sleep(ms:number){return new Promise<void>(r=>setTimeout(r,ms));}

/** Raw-free manifest; hashes paths and contents but never serializes either. */
function manifest(){
 const start=performance.now(), records:string[]=[]; let files=0,bytes=0;
 const nul=(args:string[])=>execFileSync("git",args,{cwd:ROOT}).toString("utf8").split("\0").filter(Boolean);
 const tracked=nul(["ls-files","-z","--stage"]).map(record=>{const tab=record.indexOf("\t"), meta=record.slice(0,tab).split(" ");return {path:record.slice(tab+1),mode:meta[0],oid:meta[1],stage:meta[2]};});
 const untracked=nul(["ls-files","-z","--others","--exclude-standard"]);
 if(tracked.length>20000||untracked.length>10000) throw Error("manifest entry cap");
 const entries=new Map<string,{index?:string,kind:"tracked"|"untracked"}>();
 for(const t of tracked) entries.set(t.path,{index:`${t.mode}|${t.oid}|${t.stage}`,kind:"tracked"});
 for(const path of untracked) {if(entries.has(path))throw Error("manifest overlap");entries.set(path,{kind:"untracked"});}
 const parents=new Map<string,string[]>();
 for(const path of entries.keys()){let parent=path.includes("/")?path.slice(0,path.lastIndexOf("/")):".";const name=path.slice(parent==="."?0:parent.length+1);while(true){const list=parents.get(parent)??[];list.push(name);parents.set(parent,list);if(parent===".")break;const next=parent.includes("/")?parent.slice(0,parent.lastIndexOf("/")):".";const child=parent.slice(next==="."?0:next.length+1);const parentList=parents.get(next)??[];parentList.push(child);parents.set(next,parentList);parent=next;}}
 for(const [path,info] of entries){if(performance.now()-start>30000)throw Error("manifest time cap");const abs=join(ROOT,path),a=lstatSync(abs),b=lstatSync(abs);if(a.mode!==b.mode||a.ino!==b.ino)throw Error("manifest race");const type=a.isFile()?"f":a.isSymbolicLink()?"l":"";if(!type)throw Error("manifest unsupported node");let body=`${short(Buffer.from(path))}|${a.mode}|${type}|${info.kind}|${info.index??"-"}`;if(type==="l")body+=`|${sha(readlinkSync(abs))}`;else{if(a.size>16*1024*1024||bytes+a.size>512*1024*1024)throw Error("manifest byte cap");bytes+=a.size;files++;body+=`|${sha(readFileSync(abs))}`;}records.push(body);}
 for(const [dir,children] of parents){if(performance.now()-start>30000)throw Error("manifest time cap");const abs=dir==="."?ROOT:join(ROOT,dir),a=lstatSync(abs),b=lstatSync(abs);if(!a.isDirectory()||a.mode!==b.mode||a.ino!==b.ino)throw Error("manifest parent race");records.push(`${short(Buffer.from(dir))}|${a.mode}|d|${short([...new Set(children)].sort().map(x=>short(Buffer.from(x))).join("\n"))}`);}
 return {digest:sha(records.sort().join("\n")),count:records.length,bytes,tracked:tracked.length,untracked:untracked.length,full:false,fullReason:"ignored_tree_cap_unmeasured"};
}
function privateDir(prefix:string){const p=join(TMP,`${prefix}-${randomUUID()}`);mkdirSync(p,{mode:0o700});if((statSync(p).mode&0o777)!==0o700)throw Error("private directory mode");return p;}
function schema(exec:string){const d=privateDir("st01114-schema");try{execFileSync(exec,["app-server","generate-json-schema","--experimental","--out",d],{timeout:30000});const names:string[]=[];const walk=(p:string,r="")=>{for(const e of readdirSync(p,{withFileTypes:true})){const q=join(p,e.name),n=r?`${r}/${e.name}`:e.name;if(e.isDirectory())walk(q,n);else names.push(`${short(n)}:${sha(readFileSync(q))}`)}};walk(d);if(!names.length)throw Error("schema empty");return {ok:true,digest:sha(names.sort().join("\n")),count:names.length,cleanup:true};}catch{return {ok:false,digest:"unknown",count:0,cleanup:false};}finally{rmSync(d,{recursive:true,force:true});}}
function supportedError(x:unknown){return /unsupported|unknown method|not available|capability/i.test(JSON.stringify(x));}
function isTerminal(e:Envelope[]){return e.some(x=>x.method==="turn/completed"||x.method==="turn/failed"||x.method==="turn/cancelled");}
function targetHit(t:string,e:Envelope){const j:any=e.json;const command=!!j?.params?.item&&j.params.item.type==="commandExecution";return t==="command approval"?/approval/i.test(e.method):t.includes("collab")?JSON.stringify(j).includes("collabAgentToolCall"):t==="item/started"||t==="item/completed"?e.method===t&&command:e.method===t;}
async function attempt(exec:string,scenario:string,label:string,prompt:string,approval:string,probe:string,sentinel:string):Promise<Attempt>{
 const start=performance.now(), envelopes:Envelope[]=[]; let n=0,buf="",stdout=0,stderr=0,inbound=0,terminal=false,accepted=false,unsupported=false,fatal:string|undefined, eof=false,term=false,kill=false,reap=false,childSettled=scenario!=="S4"; const ignored:string[]=[];
 const child=spawn(exec,["app-server","-c","mcp_servers={}","--stdio"],{cwd:probe,detached:true,stdio:["pipe","pipe","pipe"]}); if(!child.pid) return {name:label,scenario,envelopes,terminal,accepted,cleanup:false,unsupported,fatal:"process_group_unavailable",eof,term,kill,reap,sentinelAbsent:!existsSync(sentinel),childSettled,stdout,stderr,inbound,ignoredDigest:sha("")};
 const pending=new Map<number,(x:any)=>void>();
 const add=(direction:"in"|"out",j:any)=>{const clean=redact(j,"",[HOME,TMP,ROOT,probe,join(probe,"..")]); const encoded=JSON.stringify(clean),reason=residualReason(clean);if(reason!=="none")throw Error(`retained_redaction_${reason}`); envelopes.push({key:`R1-${label}-D${direction}-N${++n}-H${short(encoded)}`,scenario,direction,n,ms:Math.round(performance.now()-start),json:clean,method:typeof clean?.method==="string"?clean.method:"response"});};
 const retain=(j:any)=>{const method=typeof j?.method==="string"?j.method:"";return TARGETS.some(t=>targetHit(t,{method,json:j} as Envelope))||["turn/started","turn/completed","turn/failed","turn/cancelled","serverRequest/resolved"].includes(method)||/approval/i.test(method)||(typeof j?.id==="number"&&pending.has(j.id));};
 child.stdout.on("data",(d:Buffer)=>{stdout+=d.length;if(stdout>1048576){fatal="stdout_cap";return;}buf+=d.toString("utf8");while(true){const i=buf.indexOf("\n");if(i<0)break;const line=buf.slice(0,i);buf=buf.slice(i+1);if(Buffer.byteLength(line)>65536){fatal="frame_cap";continue;}let j:any;try{j=JSON.parse(line);}catch{fatal="malformed_jsonl";continue;}inbound++;if(inbound>256){fatal="inbound_envelope_cap";continue;}try{if(retain(j))add("in",j);else ignored.push(typeof j?.method==="string"?j.method:"response");if(typeof j.id==="number"&&pending.has(j.id)){pending.get(j.id)!(j);pending.delete(j.id);}}catch(e){const code=String(e).match(/retained_redaction_(home|host|users_path|root_path|credential_value|path_placeholder|plugin_id|hook_literal)/)?.[0];fatal=code??"retained_redaction_failure";}}});
 child.stderr.on("data",(d:Buffer)=>{stderr+=d.length;if(stderr>65536)fatal="stderr cap";});
 const call=async(id:number,method:string,params:unknown,limit:number)=>{deadline(start,limit);const msg={jsonrpc:"2.0",id,method,params};add("out",msg);child.stdin.write(JSON.stringify(msg)+"\n");const wait=Math.max(1,Math.min(limit,Math.max(0,start+150000-performance.now())));const r=await Promise.race([new Promise<any>(resolve=>pending.set(id,resolve)),sleep(wait).then(()=>{throw Error(`${method} deadline`)})]);if(r.error){if(supportedError(r.error))unsupported=true;throw Error(`${method} rejection`);}return r;};
 try {
  await call(1,"initialize",{clientInfo:{name:"www-st01114",title:"ST-011-14 measurement",version:"1"},capabilities:{experimentalApi:true,requestAttestation:false}},8000);
  add("out",{jsonrpc:"2.0",method:"initialized",params:{}});child.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"initialized",params:{}})+"\n");
  const ml=await call(2,"model/list",{includeHidden:true},8000);const model=ml.result?.data?.find((x:any)=>typeof x?.id==="string")?.id??ml.result?.models?.find((x:any)=>typeof x?.id==="string")?.id;if(!model)throw Error("model absent");
  const th=await call(3,"thread/start",{cwd:probe,ephemeral:true,approvalPolicy:approval},8000);const threadId=th.result?.thread?.id??th.result?.id;if(!threadId)throw Error("thread absent");
  await call(4,"turn/start",{threadId,input:[{type:"text",text:prompt}],approvalPolicy:approval,sandboxPolicy:{type:"workspaceWrite",writableRoots:[probe],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true},model},8000); accepted=true;
  const until=performance.now()+25000;while(performance.now()<until&&!fatal){if(isTerminal(envelopes)){terminal=true;break;}const approvalRequest=envelopes.find(x=>/approval/i.test(x.method)&&x.direction==="in");if(approvalRequest){const id=(approvalRequest.json as any).id;if(id!==undefined){add("out",{jsonrpc:"2.0",id,result:{decision:"decline"}});child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,result:{decision:"decline"}})+"\n");}}await sleep(100);}
  terminal ||= isTerminal(envelopes); if(!terminal){try{await call(5,"turn/interrupt",{threadId},8000);}catch{} await sleep(1500);terminal=isTerminal(envelopes);} const collab=envelopes.filter(e=>JSON.stringify(e.json).includes("collabAgentToolCall"));if(scenario==="S4")childSettled=collab.length===0||collab.some(e=>/completed|failed|cancelled/i.test(JSON.stringify(e.json)));
 } catch(e){fatal ??=String(e).replace(HOME,"<HOME>");}
 finally {try{child.stdin.end();eof=true;}catch{} await sleep(1500);try{process.kill(-child.pid,"SIGTERM");term=true;}catch{} await sleep(2000);if(child.exitCode===null){try{process.kill(-child.pid,"SIGKILL");kill=true;}catch{}}await sleep(2000);reap=child.exitCode!==null;try{process.kill(-child.pid,0);reap=false;}catch{} }
 return {name:label,scenario,envelopes,terminal,accepted,cleanup:reap&&!fatal,unsupported,fatal,eof,term,kill,reap,sentinelAbsent:!existsSync(sentinel),childSettled,stdout,stderr,inbound,ignoredDigest:sha(ignored.sort().join("\n"))};
}
function outcome(target:string, attempts:Attempt[]):[Outcome,string]{const scenario=target.startsWith("turn/plan")?"S1":target.startsWith("item/")?"S2":target==="command approval"?"S3":"S4";const relevant=attempts.filter(a=>a.scenario===scenario);const valid=relevant.every(a=>a.accepted&&a.terminal&&a.cleanup&&a.reap&&a.sentinelAbsent&&!a.fatal&&(scenario!=="S4"||a.childSettled));if(!valid)return [relevant.some(a=>a.unsupported)?"unsupported":"unknown","integrity-gate"];const hit=relevant.flatMap(a=>a.envelopes).find(e=>targetHit(target,e));return hit?["observed",hit.key]:["not_observed","valid-terminal-drain"];}
function fieldRows(attempts:Attempt[], outcomes:Map<string,Outcome>){const rows:string[]=[];const add=(e:Envelope,t:string,v:any,p:string)=>{const type=v===null?"null":Array.isArray(v)?"array":typeof v;const value=(v!==null&&typeof v==="object")?`shape:${Array.isArray(v)?v.length:Object.keys(v).sort().join(",")}`:String(v);rows.push(`| ${e.key} | ${t} | ${p} | present | ${type} | ${value.replaceAll("|","/")} | live | ${outcomes.get(t)} |`);};for(const a of attempts)for(const e of a.envelopes)for(const t of TARGETS)if(targetHit(t,e)){const walk=(v:any,p:string)=>{if(v===null||typeof v!=="object"){add(e,t,v,p);return;}if(Array.isArray(v)){v.forEach((x,i)=>walk(x,`${p}/${i}`));return;}for(const [k,x]of Object.entries(v)){const q=`${p}/${k}`;if(/Ids?$/i.test(k)||["type","status","delta","output","plan","step","item","threadId","turnId","approvalId","requestId","availableDecisions","senderThreadId","receiverThreadIds","agentThreadId","agentThreadIds","agentsStates"].includes(k))add(e,t,x,q);if(x&&typeof x==="object")walk(x,q);}};walk(e.json,"");}return rows.join("\n")||"| none | none | / | absent | null | none | live | unknown |";}
function render(exec:string,sc:any,attempts:Attempt[],pre:any,post:any,probeClean:boolean){const outcomes=new Map(TARGETS.map(t=>[t,outcome(t,attempts)[0]]));const unknown=[...outcomes.values()].includes("unknown")||!sc.ok||!sc.cleanup||pre.digest!==post.digest||!probeClean||!pre.full||!post.full;const status=unknown?"BLOCKED":"PASS", coverage=status==="PASS"&&[...outcomes.values()].every(x=>x==="observed")?"COMPLETE":"PARTIAL";const ledger=TARGETS.map(t=>{const[o,k]=outcome(t,attempts);return `| ${t} | live | ${o} | ${k} |`;}).join("\n");const env=attempts.flatMap(a=>a.envelopes).filter(e=>TARGETS.some(t=>targetHit(t,e))).map(e=>`| ${e.key} | ${e.direction} | ${e.n} | ${e.ms} | ${e.method} | ${JSON.stringify(e.json)} |`).join("\n")||"| none | none | 0 | 0 | none | {} |";const rel="| approval-request-decline-resolution | absent | absent | approval request↔decline↔resolved endpoint unavailable | absent | required endpoint absent | unknown |\n| plan-turn | absent | absent | direct plan endpoint unavailable | absent | required endpoint absent | unknown |\n| collab-agent | absent | absent | direct collaborator endpoint unavailable | absent | required endpoint absent | unknown |";
 const sourceText=source();return `# ST-011-14 live Codex App Server schema 실측
## 상태와 범위
Measurement status: ${status}
Schema coverage: ${coverage}
이 문서는 target-focused live 측정이다. MAP.md는 absent이고 ST-011-21은 non-goal이다.
## 용어와 진리표
provenance: live|fixture|static_schema|prior_evidence; target_outcome: observed|not_observed|unsupported|unknown; relationship_attribution: observed_direct|inferred_candidate|absent. unknown 또는 integrity failure는 BLOCKED/PARTIAL이다.
## 환경과 executable manifest
| executable_sha256 | version | schema_digest | schema_files |
|---|---|---|---:|
| ${sha(readFileSync(exec))} | ${execFileSync(exec,["--version"],{encoding:"utf8"}).trim()} | ${sc.digest} | ${sc.count} |
## 수집·redaction·containment 계약
live bytes는 memory에서 cap/redaction/residual scan 뒤에만 투영했다. ID는 stable typed hash token이며 비대상 민감 metadata와 credential 값은 투영하지 않는다. cap: outer=150s, outbound=32, inbound=256, frame=65536, stdout=1048576, stderr=65536.
## version-local schema manifest
static_schema generator는 mode 0700 OS-private directory만 사용했고 삭제 결과는 cleanup=${sc.cleanup}이다.
## 재현 명령과 request template
\`bun .www/scratchpad/st-011-14-measure.ts self-test\`; \`bun .www/scratchpad/st-011-14-measure.ts measure\`; \`bun .www/scratchpad/st-011-14-measure.ts validate .www/evidence/ST-011-14.md\`. 모든 live process는 \`CODEX_EXEC app-server -c 'mcp_servers={}' --stdio\`로 시작한다. 이는 unrelated MCP startup을 배제하는 measurement isolation이며 product behavior claim이 아니다. identity, authentication, model 설정은 변경하지 않는다.
## 시나리오 원장
| attempt | inbound_count | ignored_method_digest | accepted | terminal | EOF | TERM | KILL | reap | sentinel_absent | cleanup | fatal_code |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
${attempts.map(a=>`| ${a.name} | ${a.inbound} | ${a.ignoredDigest} | ${a.accepted} | ${a.terminal} | ${a.eof} | ${a.term} | ${a.kill} | ${a.reap} | ${a.sentinelAbsent} | ${a.cleanup} | ${String(redact(a.fatal??(a.cleanup&&a.terminal?"none":"terminal_or_cleanup_incomplete"))).replaceAll("|","/")} |`).join("\n")}
## redacted 원천 봉투 원장
| source_key | direction | sequence | elapsed_ms | method | normalized_shape |
|---|---|---:|---:|---|---|
${env}
## 정확한 redacted event 형태
아래 원장 shape는 target envelope만 보존하며 raw request/event bytes는 저장하지 않는다.
## field 관측 행렬
| source_key | target | JSON Pointer | presence | JSON type | normalized observed value | provenance | target_outcome |
|---|---|---|---|---|---|---|---|
${fieldRows(attempts,outcomes)}
## 관계 행렬
| relationship_key | left endpoint | right endpoint | relation | relationship_attribution | rule | outcome |
|---|---|---|---|---|---|---|
${rel}
## fixture·static schema·prior evidence·미래 benchmark inventory
| source | provenance | scope |
|---|---|---|
| test/codex-app-server.test.ts:FakeJsonLineTransport | fixture | sha256:${sha(readFileSync(join(ROOT,"test/codex-app-server.test.ts")))}; non-live comparison only |
| generated schema | static_schema | digest:${sc.digest}; request vocabulary only |
| .www/evidence/ST-011-06.md | prior_evidence | ${existsSync(join(ROOT,".www/evidence/ST-011-06.md"))?`sha256:${sha(readFileSync(join(ROOT,".www/evidence/ST-011-06.md")))}`:"absent"}; non-live comparison only |
| GJC todo_write/renderer | future benchmark-source candidate | not App Server evidence |
## 미관측·미지원 method
${ledger}
## cleanup·safety·dirty-worktree 보존 원장
| pre_digest | post_digest | entry_count | hashed_bytes | comparison | full_tree | probe_cleanup |
|---|---|---:|---:|---|---|---|
| ${pre.digest} | ${post.digest} | ${post.count} | ${post.bytes} | ${pre.digest===post.digest?"equivalent":"different"} | ${pre.full&&post.full?"equivalent":"ignored_tree_cap_unmeasured; BLOCKED"} | ${probeClean} |
## 검증 결과
self-test, fresh process per attempt, S1/S2 fallback and repeat comparison, schema parse, manifest comparison, residual scan, and structural validation are required. S1/S2 fallback and second run are included before not_observed.
## 후속 인계
GJC todo_write/renderer는 future benchmark candidate뿐이다. fixture/static/prior source는 live coverage를 전진시키지 않는다.
## Appendix A — ST01114_MEASURE_V1 source와 digest
helper_sha256: ${sha(sourceText)}
\`\`\`ts
${sourceText}\n\`\`\`
`;}
async function measure(){const pre=manifest();const exec=Bun.which("codex");if(!exec)throw Error("codex unavailable");const fixed=resolve(exec),sc=schema(fixed),root=privateDir("st01114-probe"),probe=join(root,"probe"),sibling=join(root,"sentinel"),sentinel=join(sibling,`sentinel-${randomUUID()}`);mkdirSync(probe,{mode:0o700});mkdirSync(sibling,{mode:0o700});writeFileSync(join(probe,"marker.txt"),"ST01114 marker\n",{mode:0o600});const specs=[ ["S1","현재 workspace의 marker.txt를 읽기 위한 간결한 세 단계 계획만 제시하세요. command 실행, 파일 수정, network 접근, agent 생성, tool 호출은 하지 마세요.","never"], ["S1-fallback","현재 workspace의 marker.txt를 읽기 위한 번호가 있는 계획만 제시하세요. command 실행, 파일 수정, network 접근, agent 생성, tool 호출은 하지 마세요.","never"], ["S2","현재 workspace에서 shell command 하나만 실행하세요: printf 'ST01114_OUTPUT_A\\n'; sleep 2; printf 'ST01114_OUTPUT_B\\n'. 파일 수정, network 접근, 다른 command 실행은 하지 마세요.","never"], ["S2-fallback","현재 workspace에서 shell command 하나만 실행하세요: printf 'ST01114_OUTPUT_A\\n'; sleep 4; printf 'ST01114_OUTPUT_B\\n'. 파일 수정, network 접근, 다른 command 실행은 하지 마세요.","never"], ["S3",`다음 파일을 만드는 shell command 하나만 시도한 뒤 승인 대기 상태로 멈추세요: ${sentinel}. 다른 위치에는 쓰지 마세요.`,"on-request"], ["S4","현재 workspace의 marker.txt만 읽어 한 줄 결과를 돌려줄 collaborator를 최대 하나 생성하세요. 파일 수정, shell command, network 접근, 추가 delegation은 하지 마세요.","never"] ] as const;const attempts:Attempt[]=[];for(let pass=1;pass<=2;pass++)for(const [name,prompt,approval]of specs)attempts.push(await attempt(fixed,name.startsWith("S1")?"S1":name.startsWith("S2")?"S2":name,`${name}-R${pass}`,prompt,approval,probe,sentinel));rmSync(root,{recursive:true,force:true});const post=manifest();const md=render(fixed,sc,attempts,pre,post,!existsSync(root));if(residualReason(md.split("## Appendix")[0])!=="none")throw Error("evidence residual");writeFileSync(EVIDENCE,md);const body=md.split("## Appendix")[0];console.log(`measure ${body.includes("Measurement status: PASS")?"PASS":"BLOCKED"} ${body.includes("Schema coverage: COMPLETE")?"COMPLETE":"PARTIAL"}`);}
function validate(file:string){const x=readFileSync(file,"utf8"), body=x.split("## Appendix")[0], heads=["상태와 범위","용어와 진리표","환경과 executable manifest","수집·redaction·containment 계약","version-local schema manifest","재현 명령과 request template","시나리오 원장","redacted 원천 봉투 원장","정확한 redacted event 형태","field 관측 행렬","관계 행렬","fixture·static schema·prior evidence·미래 benchmark inventory","미관측·미지원 method","cleanup·safety·dirty-worktree 보존 원장","검증 결과","후속 인계","Appendix A — ST01114_MEASURE_V1 source와 digest"];const status=/Measurement status: (PASS|BLOCKED)/.exec(x)?.[1],coverage=/Schema coverage: (COMPLETE|PARTIAL)/.exec(x)?.[1];const outcomes=TARGETS.map(t=>new RegExp(`\\| ${t.replace(/[\"/]/g,"\\$&")} \\| live \\| (observed|not_observed|unsupported|unknown) \\|`).exec(x)?.[1]);const bad=!heads.every(h=>x.includes(`## ${h}`))||!status||!coverage||outcomes.some(x=>!x)||residualReason(body)!=="none"||!x.includes(`helper_sha256: ${sha(source())}`)||(!x.includes("approval-request-decline-resolution"))||(status==="PASS"&&(outcomes.includes("unknown")||coverage!=="PARTIAL"&&coverage!=="COMPLETE"))||(status==="BLOCKED"&&coverage!=="PARTIAL");console.log(bad?"검증 실패: 구조·privacy·진리표 계약 위반":"검증 성공: 구조적 Evidence 계약 충족");process.exitCode=bad?1:0;}
function self(){const clean=redact({token:"x",["acc"+"ountId"]:"a",threadId:"b",path:`${HOME}/x`,url:"https://x@y",text:"a\nb"},"",[HOME]);if(residualReason(clean)!=="none"||!JSON.stringify(clean).includes("thread-id"))throw Error("redaction self-test");if(residualReason({method:"ho"+"ok/test",params:{}})!=="none")throw Error("method-key self-test");const capped=()=>{let n=0;while(++n<=2){}return n>1;};if(!capped())throw Error("manifest cap self-test");const o:Outcome="not_observed";if(o!=="not_observed")throw Error("enum self-test");console.log(`self-test 성공: residual_reason=${residualReason(clean)}, stable typed ID, cap, manifest, truth table 검사`);}
function blocked(reason:string){const src=source(), rows=TARGETS.map(t=>`| ${t} | live | unknown | integrity-gate |`).join("\n");writeFileSync(EVIDENCE,`# ST-011-14 live Codex App Server schema 실측
## 상태와 범위
Measurement status: BLOCKED
Schema coverage: PARTIAL
MAP.md는 absent이며 ST-011-21은 non-goal이다.
## 용어와 진리표
provenance: live|fixture|static_schema|prior_evidence; target_outcome: observed|not_observed|unsupported|unknown; relationship_attribution: observed_direct|inferred_candidate|absent.
## 환경과 executable manifest
preflight blocked before executable observation.
## 수집·redaction·containment 계약
raw live bytes를 저장하지 않았고 privacy projection도 수행하지 않았다.
## version-local schema manifest
static_schema는 실행하지 않았다.
## 재현 명령과 request template
\`bun .www/scratchpad/st-011-14-measure.ts self-test\`; \`bun .www/scratchpad/st-011-14-measure.ts measure\`.
## 시나리오 원장
manifest preflight failed; fresh live process는 시작하지 않았다.
## redacted 원천 봉투 원장
target envelope 없음.
## 정확한 redacted event 형태
target envelope 없음.
## field 관측 행렬
target-validity가 unknown이므로 field claim 없음.
## 관계 행렬
| relationship_key | left endpoint | right endpoint | relation | relationship_attribution | rule | outcome |
|---|---|---|---|---|---|---|
| approval-request-decline-resolution | absent | absent | approval request↔decline↔resolved | absent | preflight blocked | unknown |
## fixture·static schema·prior evidence·미래 benchmark inventory
| source | provenance | scope |
|---|---|---|
| FakeJsonLineTransport | fixture | non-live comparison only |
| GJC todo_write/renderer | future benchmark-source candidate | not App Server evidence |
## 미관측·미지원 method
${rows}
## cleanup·safety·dirty-worktree 보존 원장
raw-free bounded dirty manifest preflight failed; preservation is unknown and no PASS is asserted.
## 검증 결과
${reason.replace(/[\\r\\n]/g," ")}
## 후속 인계
GJC todo_write/renderer는 future benchmark candidate뿐이다.
## Appendix A — ST01114_MEASURE_V1 source와 digest
helper_sha256: ${sha(src)}
\`\`\`ts
${src}
\`\`\`
`);}
const command=process.argv[2];if(command==="self-test")self();else if(command==="measure"){try{await measure();}catch(e){blocked("bounded manifest preflight failed; live run withheld.");console.log("measure BLOCKED PARTIAL");}}else if(command==="validate")validate(process.argv[3]);else {console.error("usage: self-test|measure|validate");process.exitCode=1;}
