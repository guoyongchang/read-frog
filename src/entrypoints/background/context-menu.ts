import type { Browser } from '#imports'
import type { Config } from '@/types/config/config'
import { browser, i18n, storage } from '#imports'
import { isAPIProviderConfig } from '@/types/config/provider'
import { getProviderConfigById } from '@/utils/config/helpers'
import { CONFIG_STORAGE_KEY } from '@/utils/constants/config'
import { getTranslationStateKey, TRANSLATION_STATE_KEY_PREFIX } from '@/utils/constants/storage-keys'
import { logger } from '@/utils/logger'
import { sendMessage } from '@/utils/message'
import { ensureInitializedConfig } from './config'

const MENU_ID_TRANSLATE = 'read-frog-translate'

/**
 * Register all context menu event listeners synchronously
 * This must be called during main() execution to ensure listeners are registered
 * before Chrome completes initialization
 */
export function registerContextMenuListeners() {
  // Listen for config changes using native Chrome API for persistence
  // This ensures the listener survives service worker sleep/wake cycles
  browser.storage.local.onChanged.addListener(async (changes) => {
    const configChange = changes[CONFIG_STORAGE_KEY]
    if (configChange?.newValue) {
      await updateContextMenuItems(configChange.newValue as Config)
    }
  })

  // Listen for tab activation to update menu title
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    await updateTranslateMenuTitle(activeInfo.tabId)
  })

  // Listen for tab updates (e.g., navigation)
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      await updateTranslateMenuTitle(tabId)
    }
  })

  // Listen for translation state changes in storage
  // This ensures menu updates when translation is toggled from any UI
  // (floating button, auto-translate, etc.) without interfering with
  // the translation logic in translation-signal.ts
  browser.storage.session.onChanged.addListener(async (changes) => {
    for (const [key, change] of Object.entries(changes)) {
      // Check if this is a translation state change
      if (key.startsWith(TRANSLATION_STATE_KEY_PREFIX.replace('session:', ''))) {
        // Extract tabId from key (format: "translationState.{tabId}")
        const parts = key.split('.')
        const tabId = Number.parseInt(parts[1])

        if (!Number.isNaN(tabId)) {
          // Only update menu if this is the active tab
          const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
          if (activeTab?.id === tabId) {
            const newValue = change.newValue as { enabled: boolean } | undefined
            await updateTranslateMenuTitle(tabId, newValue?.enabled)
          }
        }
      }
    }
  })

  // Handle menu item clicks
  browser.contextMenus.onClicked.addListener(handleContextMenuClick)
}

/**
 * Initialize context menu items based on config
 * This can be called asynchronously after listeners are registered
 */
export async function initializeContextMenu() {
  // Ensure config is initialized before setting up context menu
  const config = await ensureInitializedConfig()
  if (!config) {
    return
  }

  await updateContextMenuItems(config)
}

/**
 * Update context menu items based on config
 */
async function updateContextMenuItems(config: Config) {
  // Remove all existing menu items first
  await browser.contextMenus.removeAll()

  const { enabled: translateEnabled } = config.contextMenu

  if (translateEnabled) {
    browser.contextMenus.create({
      id: MENU_ID_TRANSLATE,
      title: i18n.t('contextMenu.translate'),
      contexts: ['page'],
    })
  }

  // Update translate menu title for current tab
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (activeTab?.id) {
    await updateTranslateMenuTitle(activeTab.id)
  }
}

/**
 * Update translate menu title based on current translation state
 * @param tabId - The tab ID to check translation state for
 * @param enabled - Optional: if provided, use this value instead of reading from storage
 */
async function updateTranslateMenuTitle(tabId: number, enabled?: boolean) {
  const config = await ensureInitializedConfig()
  if (!config?.contextMenu.enabled) {
    return
  }

  try {
    let isTranslated: boolean
    if (enabled !== undefined) {
      isTranslated = enabled
    }
    else {
      const state = await storage.getItem<{ enabled: boolean }>(
        getTranslationStateKey(tabId),
      )
      isTranslated = state?.enabled ?? false
    }

    await browser.contextMenus.update(MENU_ID_TRANSLATE, {
      title: isTranslated
        ? i18n.t('contextMenu.showOriginal')
        : i18n.t('contextMenu.translate'),
    })
  }
  catch {
    // Menu item might not exist if translateEnabled is false
  }
}

/**
 * Handle context menu item click
 */
async function handleContextMenuClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
) {
  if (!tab?.id) {
    return
  }

  if (info.menuItemId === MENU_ID_TRANSLATE) {
    await handleTranslateClick(tab.id)
  }
}

/**
 * Validate translation configuration in background context
 * This is a simplified version of validateTranslationConfig without toast notifications
 */
function validateTranslationConfigInBackground(config: Config): boolean {
  const { providersConfig, translate: translateConfig, language: languageConfig } = config
  const providerConfig = getProviderConfigById(providersConfig, translateConfig.providerId)

  // Check if provider exists
  if (!providerConfig) {
    logger.warn('[ContextMenu] Translation provider not found')
    return false
  }

  // Check if source and target languages are the same
  if (languageConfig.sourceCode === languageConfig.targetCode) {
    logger.warn('[ContextMenu] Source and target languages are the same')
    return false
  }

  // Check if detected language and target language are the same in auto mode
  // Note: Unlike the case above, this only warns but does NOT block translation
  // This matches the behavior of validateTranslationConfig in translate-text.ts
  if (languageConfig.sourceCode === 'auto' && languageConfig.detectedCode === languageConfig.targetCode) {
    logger.warn('[ContextMenu] Detected language matches target language in auto mode')
    // Don't return false - allow translation to proceed with warning
  }

  // Check if API key is configured for providers that require it
  if (isAPIProviderConfig(providerConfig) && !providerConfig.apiKey?.trim() && !['deeplx', 'ollama'].includes(providerConfig.provider)) {
    logger.warn('[ContextMenu] API key not configured for provider')
    return false
  }

  return true
}

/**
 * Handle translate menu click - toggle page translation
 */
async function handleTranslateClick(tabId: number) {
  const state = await storage.getItem<{ enabled: boolean }>(
    getTranslationStateKey(tabId),
  )
  const isCurrentlyTranslated = state?.enabled ?? false
  const newState = !isCurrentlyTranslated

  // If enabling translation, validate configuration first
  if (newState) {
    const config = await ensureInitializedConfig()
    if (config && !validateTranslationConfigInBackground(config)) {
      logger.error('[ContextMenu] Translation config validation failed')
      // Send a message to content script to show error notification
      void sendMessage('showTranslationConfigError', undefined, tabId)
      return
    }
  }

  // Update storage directly (instead of sending message to self)
  await storage.setItem(getTranslationStateKey(tabId), { enabled: newState })

  // Notify content script in that specific tab
  void sendMessage('translationStateChanged', { enabled: newState }, tabId)

  // Update menu title immediately
  await updateTranslateMenuTitle(tabId)
}
