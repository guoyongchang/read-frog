import type { Browser } from '#imports'
import type { Config } from '@/types/config/config'
import { browser, i18n, storage } from '#imports'
import { CONFIG_STORAGE_KEY } from '@/utils/constants/config'
import { getTranslationStateKey } from '@/utils/constants/storage-keys'
import { sendMessage } from '@/utils/message'

const MENU_ID_TRANSLATE = 'read-frog-translate'

let currentConfig: Config | null = null

/**
 * Initialize context menu based on config
 */
export async function setupContextMenu() {
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!config) {
    return
  }

  currentConfig = config
  await updateContextMenuItems(config)

  // Listen for config changes
  storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, async (newConfig) => {
    if (newConfig) {
      currentConfig = newConfig
      await updateContextMenuItems(newConfig)
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

  // Handle menu item clicks
  browser.contextMenus.onClicked.addListener(handleContextMenuClick)
}

/**
 * Update context menu items based on config
 */
async function updateContextMenuItems(config: Config) {
  // Remove all existing menu items first
  await browser.contextMenus.removeAll()

  const { translateEnabled } = config.contextMenu

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
 */
async function updateTranslateMenuTitle(tabId: number) {
  if (!currentConfig?.contextMenu.translateEnabled) {
    return
  }

  try {
    const state = await storage.getItem<{ enabled: boolean }>(
      getTranslationStateKey(tabId),
    )
    const isTranslated = state?.enabled ?? false

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
 * Handle translate menu click - toggle page translation
 */
async function handleTranslateClick(tabId: number) {
  const state = await storage.getItem<{ enabled: boolean }>(
    getTranslationStateKey(tabId),
  )
  const isCurrentlyTranslated = state?.enabled ?? false
  const newState = !isCurrentlyTranslated

  // Update storage directly (instead of sending message to self)
  await storage.setItem(getTranslationStateKey(tabId), { enabled: newState })

  // Notify content script in that specific tab
  void sendMessage('translationStateChanged', { enabled: newState }, tabId)

  // Update menu title immediately
  await updateTranslateMenuTitle(tabId)
}
