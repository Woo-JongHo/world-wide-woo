import { createLocalWorkflow } from "./local-workflow.js";
export async function runLocalWorkflowCli(args: readonly string[], root: string): Promise<string> {
 const [command, id] = args;
 if (args.length !== 2 || !id || !["check", "show", "resume"].includes(command ?? "")) throw new Error("사용법: www workflow check <RPA-ID> | show <Run-ID> | resume <Run-ID>");
 const service = createLocalWorkflow(root);
 const result = command === "check" ? await service.run(id) : command === "resume" ? await service.resume(id) : await service.inspect(id);
 if (command !== "show" && result.state.stage !== "completed") throw new Error(result.summary);
 return result.summary;
}
