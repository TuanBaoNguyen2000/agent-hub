import {
  type Locale,
  type Message,
  type MessageKey,
  type Params,
  formatDateTime,
  isLocale,
  resolveLocale,
  translate,
} from '@agenthub/i18n';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// ADR-020 item 6: the interface language. Backend texts arrive as keys and are translated here,
// so changing the language changes every text at once without asking Main again.

interface I18n {
  locale: Locale;
  t: (key: MessageKey, params?: Params) => string;
  // A message from Main, or null/undefined for nothing.
  tr: (message: Message | null | undefined) => string;
  date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  // The app's chat language: prompts the user copies for no project in particular.
  chatLocale: Locale;
  // A prompt in the given chat language, asking for replies in it (as Main's prompts do).
  prompt: (locale: Locale, key: MessageKey, params?: Params) => string;
  setLanguages: (languages: { ui: Locale; chat: Locale | null }) => void;
}

// For code outside React (unwrap) that has to show an error in the current language.
let activeLocale: Locale = resolveLocale(navigator.language);
export const currentLocale = (): Locale => activeLocale;

function promptIn(locale: Locale, key: MessageKey, params?: Params): string {
  const text = translate(locale, key, params);
  return locale === 'en' ? text : `${text} ${translate(locale, 'prompt.replyIn', { language: { key: `language.name.${locale}` as MessageKey } })}`;
}

function build(locale: Locale, chat: Locale | null, setLanguages: I18n['setLanguages']): I18n {
  return {
    locale,
    t: (key, params) => translate(locale, key, params),
    tr: (message) => (message ? translate(locale, message) : ''),
    date: (value, options) => formatDateTime(locale, value, options),
    chatLocale: chat ?? locale,
    prompt: promptIn,
    setLanguages,
  };
}

const Context = createContext<I18n>(build(activeLocale, null, () => undefined));

export function I18nProvider({ initial, children }: { initial: { ui: Locale; chat: Locale | null }; children: ReactNode }) {
  const [languages, setLanguagesState] = useState(initial);
  const setLanguages = useCallback((next: { ui: Locale; chat: Locale | null }) => {
    if (isLocale(next.ui)) setLanguagesState(next);
  }, []);
  activeLocale = languages.ui;
  useEffect(() => {
    document.documentElement.lang = languages.ui;
  }, [languages.ui]);
  const value = useMemo(() => build(languages.ui, languages.chat, setLanguages), [languages, setLanguages]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = (): I18n => useContext(Context);
