import { win32 } from "node:path";

function localPath(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]:[\\/]/i.test(value) && value.length <= 4000 && !/[\u0000-\u001f]/.test(value);
}

export function enrollmentTargets(home: string, codexHome: string | undefined, project: string | null) {
  // CODEX_HOME belongs to this process. The editor may have been launched with another value.
  const profile = codexHome ? (localPath(codexHome) ? codexHome : null)
    : localPath(home) ? win32.join(home, ".codex") : null;
  return {
    user: profile ? win32.join(profile, "hooks.json") : null,
    project: localPath(project) ? win32.join(project, ".codex", "hooks.json") : null,
    customProfile: !!codexHome,
  };
}
