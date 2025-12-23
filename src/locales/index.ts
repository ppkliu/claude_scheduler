import { createI18n } from 'vue-i18n'
import en from './en'
import zhTW from './zh-TW'
import zhCN from './zh-CN'

export type MessageSchema = typeof zhTW

const i18n = createI18n<[MessageSchema], 'en' | 'zh-TW' | 'zh-CN'>({
  legacy: false,
  locale: 'zh-TW',
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-TW': zhTW,
    'zh-CN': zhCN
  }
})

export default i18n
