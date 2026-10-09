/**
 * Messages of the checks that failed, in order. Each check is `[value, message]`;
 * a falsy value counts as a failure.
 */
export function failedChecks(checks: Array<[ok: unknown, message: string]>): string[] {
  return checks.filter(([ok]) => !ok).map(([, message]) => message)
}

/** Toast options for a form that can't be saved yet. */
export function validationToast(problems: string[]) {
  return {
    variant: "destructive" as const,
    title: problems.length === 1 ? "Please fix this field" : "Please fix these fields",
    description: problems.join(" · "),
  }
}
