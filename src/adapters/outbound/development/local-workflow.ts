import { LocalWorkflowService } from "@/core/application/work/local-workflow-service.js";
import { FileSkillRegistry }    from "@/adapters/outbound/workspace/file-skill-registry.js";
import { FileSkillRunStore }    from "@/adapters/outbound/persistence/skill-run-store.js";
import { verifyLocalWorkflow }  from "@/adapters/outbound/development/local-workflow-verifier.js";
import { resolve }              from "node:path";
export function createLocalWorkflow(root: string): LocalWorkflowService {
 return new LocalWorkflowService(new FileSkillRegistry(root), new FileSkillRunStore(resolve(root, ".www")), expected => verifyLocalWorkflow(root, expected));
}
