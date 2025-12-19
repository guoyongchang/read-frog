import { i18n } from '#imports'
import { useAtom } from 'jotai'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { configFieldsAtomMap } from '@/utils/atoms/config'
import { translateTextWithDirection } from '@/utils/host/translate/translate-text'

const SPACE_KEY = ' '
const TRIGGER_COUNT = 3
const LAST_CYCLE_DIRECTION_KEY = 'read-frog-input-translation-last-cycle-direction'

/**
 * Get last cycle direction from sessionStorage
 */
function getLastCycleDirection(): 'normal' | 'reverse' | undefined {
  try {
    const value = sessionStorage.getItem(LAST_CYCLE_DIRECTION_KEY)
    if (value === 'normal' || value === 'reverse') {
      return value
    }
  }
  catch {
    // sessionStorage may not be available in some contexts
  }
  return undefined
}

/**
 * Set last cycle direction in sessionStorage
 */
function setLastCycleDirection(direction: 'normal' | 'reverse'): void {
  try {
    sessionStorage.setItem(LAST_CYCLE_DIRECTION_KEY, direction)
  }
  catch {
    // sessionStorage may not be available in some contexts
  }
}

/**
 * Set text content with undo support using execCommand.
 * This allows Ctrl+Z to restore the original text.
 */
function setTextWithUndo(element: HTMLInputElement | HTMLTextAreaElement | HTMLElement, text: string) {
  element.focus()

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // Select all text in input/textarea
    element.select()
  }
  else if (element.isContentEditable) {
    // Select all content in contenteditable
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  // Use execCommand to insert text with undo support
  // Note: execCommand is deprecated but still the only way to support undo
  document.execCommand('insertText', false, text)

  // Dispatch input event for framework compatibility (React, Vue, etc.)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

export function useInputTranslation() {
  const [inputTranslationConfig] = useAtom(configFieldsAtomMap.inputTranslation)
  const spaceTimestampsRef = useRef<number[]>([])
  const isTranslatingRef = useRef(false)

  const handleTranslation = useCallback(async (element: HTMLInputElement | HTMLTextAreaElement | HTMLElement) => {
    if (isTranslatingRef.current)
      return

    // Security: skip password fields to prevent exposing sensitive data
    if (element instanceof HTMLInputElement && element.type === 'password') {
      return
    }

    // Get the text content based on element type
    let text: string
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      text = element.value
    }
    else if (element.isContentEditable) {
      text = element.textContent || ''
    }
    else {
      return
    }

    // Remove trailing spaces (only TRIGGER_COUNT - 1 because the last space
    // was prevented by preventDefault and never inserted)
    text = text.slice(0, -(TRIGGER_COUNT - 1))

    // Set the trimmed text back immediately (with undo support)
    setTextWithUndo(element, text)

    if (!text.trim()) {
      return
    }

    // Determine actual translation direction
    let actualDirection: 'normal' | 'reverse' = 'normal'
    if (inputTranslationConfig.direction === 'cycle') {
      // Toggle from last direction (stored in sessionStorage, not config)
      const lastDirection = getLastCycleDirection()
      actualDirection = lastDirection === 'normal' ? 'reverse' : 'normal'
      setLastCycleDirection(actualDirection)
    }
    else {
      actualDirection = inputTranslationConfig.direction
    }

    isTranslatingRef.current = true
    const directionLabel = actualDirection === 'normal'
      ? i18n.t('options.inputTranslation.direction.normal')
      : i18n.t('options.inputTranslation.direction.reverse')
    const toastId = toast.loading(i18n.t('options.inputTranslation.toast.translating', [directionLabel]))

    // Store original text to detect if user edited during translation
    const originalText = text

    try {
      const translatedText = await translateTextWithDirection(text, actualDirection)

      // Check if element content changed during translation (user input)
      let currentText: string
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        currentText = element.value
      }
      else if (element.isContentEditable) {
        currentText = element.textContent || ''
      }
      else {
        currentText = originalText
      }

      // Only apply translation if content hasn't changed during async operation
      if (currentText === originalText && translatedText) {
        setTextWithUndo(element, translatedText)
        toast.success(i18n.t('options.inputTranslation.toast.success', [directionLabel]), { id: toastId })
      }
      else if (currentText !== originalText) {
        // User edited during translation, dismiss the loading toast
        toast.dismiss(toastId)
      }
      else {
        toast.dismiss(toastId)
      }
    }
    catch (error) {
      console.error('Input translation error:', error)
      toast.error(i18n.t('options.inputTranslation.toast.failed'), { id: toastId })
    }
    finally {
      isTranslatingRef.current = false
    }
  }, [inputTranslationConfig.direction])

  useEffect(() => {
    if (!inputTranslationConfig.enabled)
      return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only process space key
      if (event.key !== SPACE_KEY) {
        // Reset on any other key
        spaceTimestampsRef.current = []
        return
      }

      // Check if the active element is an input field
      const activeElement = document.activeElement
      const isInputField = activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement
        || (activeElement instanceof HTMLElement && activeElement.isContentEditable)

      if (!isInputField || !activeElement) {
        spaceTimestampsRef.current = []
        return
      }

      const now = Date.now()
      const timestamps = spaceTimestampsRef.current

      // Remove timestamps older than threshold
      const timeThreshold = inputTranslationConfig.timeThreshold
      while (timestamps.length > 0 && now - timestamps[0] > timeThreshold * (TRIGGER_COUNT - 1)) {
        timestamps.shift()
      }

      // Add current timestamp
      timestamps.push(now)

      // Check if we have enough rapid presses
      if (timestamps.length >= TRIGGER_COUNT) {
        // Check if all presses are within the time threshold
        const allWithinThreshold = timestamps.every((ts, i) => {
          if (i === 0)
            return true
          return ts - timestamps[i - 1] <= timeThreshold
        })

        if (allWithinThreshold) {
          event.preventDefault()
          spaceTimestampsRef.current = []
          void handleTranslation(activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [inputTranslationConfig.enabled, inputTranslationConfig.timeThreshold, handleTranslation])
}
