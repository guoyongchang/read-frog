import { i18n } from '#imports'
import { useAtom } from 'jotai'
import { Switch } from '@/components/shadcn/switch'
import { configFieldsAtomMap } from '@/utils/atoms/config'
import { ConfigCard } from '../../components/config-card'

export function InputTranslationShowToast() {
  const [inputTranslation, setInputTranslation] = useAtom(
    configFieldsAtomMap.inputTranslation,
  )

  return (
    <ConfigCard
      title={i18n.t('options.inputTranslation.showToast.title')}
      description={i18n.t('options.inputTranslation.showToast.description')}
    >
      <div className="w-full flex justify-end">
        <Switch
          checked={inputTranslation.showToast}
          onCheckedChange={(checked) => {
            void setInputTranslation({ ...inputTranslation, showToast: checked })
          }}
        />
      </div>
    </ConfigCard>
  )
}
