/**
 * Migration script from v030 to v031
 * Adds contextMenu configuration for right-click menu functionality
 *
 * Before (v030):
 *   No contextMenu field
 *
 * After (v031):
 *   contextMenu: {
 *     translateEnabled: boolean  // Enable translate in context menu (default: true)
 *     readEnabled: boolean       // Enable read in context menu (default: false)
 *   }
 */

export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    contextMenu: {
      translateEnabled: true,
      readEnabled: false,
    },
  }
}
