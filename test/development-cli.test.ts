import { execFileSync } from "node:child_process";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDevelopmentService, runDevelopmentCli } from "../src/workflows/tui-development/adapters/development-runtime";
import { executeDevelopmentShellCommand, DevelopmentService } from "../src/workflows/tui-development/service";
import { DevelopmentStore } from "../src/workflows/tui-development/adapters/development-store";
import type { ProjectActivity } from "../src/system/contracts/project-activity";
import { runCli, type CliDependencies } from "../src/cli";
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive:true, force:true }); });
function fixture() {
 const root = mkdtempSync(join(realpathSync(tmpdir()), "www-development-cli-")); directories.push(root);
 const projectRoot = join(root, "project"); mkdirSync(join(projectRoot, ".www/control-ledger"), { recursive:true });
 writeFileSync(join(projectRoot, ".www/control-ledger/traceability.json"), JSON.stringify({ schemaVersion:1, references:[{kind:"linear-issue",id:"WOO-683",uuid:"ad6047f4-ec9e-478b-8495-7e9c501b2ae2",url:"https://linear.app/woo/issue/WOO-683"}],links:[] }));
 execFileSync("git",["init","--quiet"],{cwd:projectRoot});
 return {projectRoot, dataRoot:join(root,"data"), vaultRoot:join(root,"vault")};
}
const activity = (id: string): ProjectActivity => ({ schemaVersion:1,id,projectId:"provider-thread-stream",sequence:1,recordedAt:new Date().toISOString(),kind:"message",phase:"completed",provider:"codex",nativeRefs:{threadId:"thread",turnId:"turn"},sourceDigest:"digest",payload:{text:"공개 메시지"} });
test("CLI binds existing Linear UUID and TUI captures only after binding, then exports and opens the same document", async () => {
 const options = fixture(); const opened:string[]=[];
 const service = createDevelopmentService({...options,runId:"workbench-real",openUri:async uri => {opened.push(uri);}});
 service.observe(activity("before"));
 const unit = JSON.parse(await runDevelopmentCli(["unit","Message"],options));
 await runDevelopmentCli(["link",unit.id,"WOO-683"],options);
 expect(await executeDevelopmentShellCommand("/work issue WOO-683",service)).toContain("workbench-real");
 service.observe(activity("after"));
 expect(await executeDevelopmentShellCommand("/map",service)).toBeNull();
 expect(await executeDevelopmentShellCommand("/map issue WOO-683",service)).toContain("Message");
 expect(await executeDevelopmentShellCommand("/work status",service)).toContain("공개 기록 1");
 const checkpoint = await service.execute(["checkpoint"]); const path = checkpoint.split("\n")[1]!;
 expect(readFileSync(path,"utf8")).toContain("WOO-683");
 await service.execute(["open"]); expect(opened[0]).toBe(`obsidian://open?path=${encodeURIComponent(path)}`);
 await service.close();
 const reopened = createDevelopmentService({...options,runId:"workbench-real",openUri:async uri=>{opened.push(uri);}});
 await reopened.execute(["open"]); expect(opened).toHaveLength(2); await reopened.close();
 const store = new DevelopmentStore(options); const context=store.getRunContext("workbench-real");
 expect(context.records.filter(x=>x.kind!=="document").map(x=>x.sourceEventId)).toEqual(["after"]); expect(context.issues[0]?.uuid).toBe("ad6047f4-ec9e-478b-8495-7e9c501b2ae2"); store.close();
});
test("capture errors stay observable and unrelated slash commands remain untouched",async()=>{
 const service=new DevelopmentService("run",{execute:async()=>"상태",capture(){throw new Error("disk full");},checkpoint:async()=>"note"});
 expect(()=>service.observe(activity("a"))).toThrow("disk full");
 expect(await service.execute(["status"])).toContain("disk full");
 expect(await executeDevelopmentShellCommand("/stats",service)).toBeNull();
 expect(await executeDevelopmentShellCommand("/work status")).toContain("사용할 수 없습니다");
});
test("CLI preserves test argv help/version and shell metacharacters without top-level reinterpretation",async()=>{
 const args=["test","run","--","bun","--version","a; echo secret", "$(echo x)"];
 let seen:string[]=[]; const out:string[]=[];
 const deps={runDevelopment:async(value:string[])=>{seen=value;return "ok";},writeOut:(s:string)=>out.push(s),writeError:(s:string)=>{throw new Error(s);}} as unknown as CliDependencies;
 expect(await runCli(["development",...args],deps)).toBe(0); expect(seen).toEqual(args); expect(out).toEqual(["ok"]);
});

test("completion freezes a checkpoint before later events and binding switches",async()=>{
 const options=fixture(); const service=createDevelopmentService({...options,runId:"run"});
 await service.execute(["issue","WOO-683"]);
 service.observe(activity("message1"));
 service.observe({...activity("terminal"),kind:"progress",payload:{method:"turn/completed"}});
 service.observe(activity("message2"));
 await service.close();
 const store=new DevelopmentStore(options); const context=store.getRunContext("run");
 const doc=context.records.find(x=>x.kind==="document")!;
 const text=readFileSync(String(doc.metadata.path),"utf8");
 expect(text).toContain(context.records.find(x=>x.sourceEventId==="message1")!.id);
 expect(text).not.toContain(context.records.find(x=>x.sourceEventId==="message2")!.id);store.close();
});
