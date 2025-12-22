import { i18n } from '#imports'
import { PageLayout } from '../../components/page-layout'
import { InputTranslationDirection } from './input-translation-direction'
import { InputTranslationShowToast } from './input-translation-show-toast'
import { InputTranslationThreshold } from './input-translation-threshold'
import { InputTranslationToggle } from './input-translation-toggle'

export function InputTranslationPage() {
  return (
    <PageLayout title={i18n.t('options.overlayTools.inputTranslation.title')}>
      <div className="*:border-b [&>*:last-child]:border-b-0">
        <InputTranslationToggle />
        <InputTranslationDirection />
        <InputTranslationThreshold />
        <InputTranslationShowToast />
      </div>
    </PageLayout>
  )
}
