/**
 * Migration script from v038 to v039
 * Adds 'inputTranslation' config for triple-space input translation feature
 *
 * Before (v038):
 *   { ... }
 *
 * After (v039):
 *   { ..., inputTranslation: { enabled: true, direction: 'normal', timeThreshold: 300, showToast: true } }
 */

export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    inputTranslation: {
      enabled: true,
      direction: 'normal',
      timeThreshold: 300,
      showToast: true,
    },
  }
}
