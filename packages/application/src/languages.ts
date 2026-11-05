import { type Locale, type Message, type MessageKey, type Params, isLocale, msg, translate } from '@agenthub/i18n';

import type { MetadataStore, StoredProject } from './index';

// ADR-020 item 6: the interface language and the language AgentHub speaks to agents in are two
// settings. Both default to the system's language; a project may choose its own chat language.
export const UI_LANGUAGE_KEY = 'ui_language';
export const CHAT_LANGUAGE_KEY = 'chat_language';

export function uiLanguageOf(store: Pick<MetadataStore, 'settings'>, fallback: Locale): Locale {
  const chosen = store.settings.get(UI_LANGUAGE_KEY);
  return isLocale(chosen) ? chosen : fallback;
}

export function appChatLanguageOf(store: Pick<MetadataStore, 'settings'>, fallback: Locale): Locale {
  const chosen = store.settings.get(CHAT_LANGUAGE_KEY);
  return isLocale(chosen) ? chosen : uiLanguageOf(store, fallback);
}

export function chatLanguageOf(store: Pick<MetadataStore, 'settings'>, project: Pick<StoredProject, 'chatLanguage'>, fallback: Locale): Locale {
  return project.chatLanguage ?? appChatLanguageOf(store, fallback);
}

const languageName = (locale: Locale): Message => msg(`language.name.${locale}` as MessageKey);

// A prompt in the chat language; in any language but English it also asks for replies in it.
export function promptIn(locale: Locale, key: MessageKey, params?: Params): string {
  const text = translate(locale, key, params);
  return locale === 'en' ? text : `${text} ${translate(locale, 'prompt.replyIn', { language: languageName(locale) })}`;
}

export const documentLanguageName = languageName;
