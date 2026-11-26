import { createHostFilesEnvironmentAtoms } from "@a4code/client-runtime/state/hostFiles";

import { connectionAtomRuntime } from "../connection/runtime";

export const hostFilesEnvironment = createHostFilesEnvironmentAtoms(connectionAtomRuntime);
