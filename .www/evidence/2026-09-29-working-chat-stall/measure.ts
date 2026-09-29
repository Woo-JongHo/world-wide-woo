if (process.env.WWW_MONITOR_BASELINE === "1") Bun.plugin({name:"prior-cache-key",setup(build){build.onLoad({filter:/www-monitor-view\.ts$/},async()=>({contents:await Bun.file(".www/scratchpad/2026-09-29-working-chat-stall/baseline-monitor.ts").text(),loader:"ts"}));}});
const {wwwFixture}=await import(process.cwd()+"/test/fixtures/www-snapshot.ts");
const {WwwMonitorView}=await import(process.cwd()+"/src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts");
const {projectRuntimeMonitor}=await import(process.cwd()+"/src/core/domain/observability/runtime-monitor.ts");
function freeze(value){if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const initial=wwwFixture();
const base=initial.activities[0];
const output="test/example.test.ts:\n"+"(pass) actual case [1.00ms]\n".repeat(1000)+"\n1000 pass\n0 fail\nRan 1000 tests across 1 file. [1.00s]";
const activities=freeze([{...base,id:"changed",kind:"file-change",phase:"completed",sequence:1},...Array.from({length:40},(_,i)=>({...base,id:"test-"+i,sequence:i+2,kind:"tool",phase:"completed",nativeRefs:{...base.nativeRefs,itemId:"test-"+i},payload:{method:"item/completed",params:{item:{type:"commandExecution",command:"bun test",aggregatedOutput:output,exitCode:0}}}}))]);
let snapshot=freeze({...initial,activities});
const view=new WwwMonitorView(()=>projectRuntimeMonitor(snapshot),()=>0,false,()=>snapshot,true);
view.render(55);
const times=[];
for(let i=0;i<30;i++){snapshot=Object.freeze({...snapshot,revision:i+100,draft:"stream "+i});const t=performance.now();view.render(55);times.push(performance.now()-t);}
times.sort((a,b)=>a-b);
console.log(JSON.stringify({baseline:process.env.WWW_MONITOR_BASELINE==="1",runs:40,bytesPerOutput:output.length,iterations:30,p50:times[14],p95:times[28],scope:"Synthetic compact sidebar, unchanged frozen observations, changing draft/revision. Not live frame timing."}));
