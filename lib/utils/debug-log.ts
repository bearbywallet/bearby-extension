/**
 * Creates a step-based debug logger.
 * DRY: single factory function, no copy/paste of console.log patterns.
 */
export function createStepLogger(prefix: Readonly<string>) {
  return (step: string, details: Readonly<Record<string, unknown>>): void => {
    console.log(`[${prefix}] ${step}`, JSON.stringify(details));
  };
}
