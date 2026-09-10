import { LocalWorkflowService } from "../../../core/application/work/local-workflow-service.js";
import { FileSkillRegistry } from "../workspace/file-skill-registry.js";
import { FileSkillRunStore } from "../persistence/skill-run-store.js";
import { verifyLocalWorkflow } from "./local-workflow-verifier.js";
import { resolve } from "node:path";
export function createLocalWorkflow(root: string): LocalWorkflowService {
 return new LocalWorkflowService(new FileSkillRegistry(root), new FileSkillRunStore(resolve(root, ".www")), expected => verifyLocalWorkflow(root, expected));
}
