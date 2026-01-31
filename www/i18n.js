const I18n = (function() {
  const SUPPORTED_LANGUAGES = {
    en: { name: 'English', nativeName: 'English', dir: 'ltr' },
    es: { name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
    fr: { name: 'French', nativeName: 'Français', dir: 'ltr' },
    el: { name: 'Greek', nativeName: 'Ελληνικά', dir: 'ltr' },
    zh: { name: 'Chinese', nativeName: '中文', dir: 'ltr' },
    hi: { name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
    ar: { name: 'Arabic', nativeName: 'العربية', dir: 'rtl' }
  };

  const DEFAULT_LANGUAGE = 'en';
  const STORAGE_KEY = 'mcc_language';
  
  let currentLanguage = DEFAULT_LANGUAGE;
  let translations = {};
  let isLoaded = false;

  function getSavedLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function saveLanguage(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      console.warn('Could not save language preference');
    }
  }

  function detectBrowserLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang) {
      const shortLang = browserLang.split('-')[0].toLowerCase();
      if (SUPPORTED_LANGUAGES[shortLang]) {
        return shortLang;
      }
    }
    return DEFAULT_LANGUAGE;
  }

  async function loadTranslations(lang) {
    try {
      const cacheBuster = 'v=1738300800';
      const response = await fetch(`/locales/${lang}.json?${cacheBuster}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${lang} translations`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error loading translations for ${lang}:`, error);
      if (lang !== DEFAULT_LANGUAGE) {
        return loadTranslations(DEFAULT_LANGUAGE);
      }
      return {};
    }
  }

  function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  function t(key, replacements = {}) {
    let text = getNestedValue(translations, key);
    
    if (text === null) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }

    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(new RegExp(`{{${placeholder}}}`, 'g'), replacements[placeholder]);
    });

    return text;
  }

  function translateElement(element) {
    const key = element.getAttribute('data-i18n');
    if (!key) return;

    const attrTarget = element.getAttribute('data-i18n-attr');
    const translated = t(key);

    if (attrTarget) {
      element.setAttribute(attrTarget, translated);
    } else {
      const svg = element.querySelector('svg');
      const containsHtml = /<[a-z][\s\S]*>/i.test(translated);
      if (svg) {
        const svgClone = svg.cloneNode(true);
        if (containsHtml) {
          element.innerHTML = translated;
        } else {
          element.textContent = translated;
        }
        element.insertBefore(svgClone, element.firstChild);
        element.insertBefore(document.createTextNode(' '), svgClone.nextSibling);
      } else {
        if (containsHtml) {
          element.innerHTML = translated;
        } else {
          element.textContent = translated;
        }
      }
    }
  }

  function translatePage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(translateElement);

    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = SUPPORTED_LANGUAGES[currentLanguage]?.dir || 'ltr';

    const event = new CustomEvent('languageChanged', { 
      detail: { language: currentLanguage } 
    });
    document.dispatchEvent(event);
  }

  async function setLanguage(lang) {
    if (!SUPPORTED_LANGUAGES[lang]) {
      console.warn(`Language ${lang} is not supported`);
      lang = DEFAULT_LANGUAGE;
    }

    currentLanguage = lang;
    translations = await loadTranslations(lang);
    saveLanguage(lang);
    
    const langInfo = SUPPORTED_LANGUAGES[lang];
    document.documentElement.dir = langInfo.dir || 'ltr';
    document.documentElement.lang = lang;
    
    translatePage();
    isLoaded = true;

    return currentLanguage;
  }

  async function init() {
    const savedLang = getSavedLanguage();
    const initialLang = savedLang || detectBrowserLanguage();
    await setLanguage(initialLang);
    return currentLanguage;
  }

  function getCurrentLanguage() {
    return currentLanguage;
  }

  function getSupportedLanguages() {
    return { ...SUPPORTED_LANGUAGES };
  }

  function createLanguageSwitcher(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'language-switcher';
    wrapper.innerHTML = `
      <button class="lang-btn" aria-label="Change language" title="Change language">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span class="current-lang">${SUPPORTED_LANGUAGES[currentLanguage].nativeName}</span>
        <svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div class="lang-dropdown">
        ${Object.entries(SUPPORTED_LANGUAGES).map(([code, lang]) => `
          <button class="lang-option ${code === currentLanguage ? 'active' : ''}" data-lang="${code}">
            <span class="lang-native">${lang.nativeName}</span>
            <span class="lang-english">${lang.name}</span>
          </button>
        `).join('')}
      </div>
    `;

    container.appendChild(wrapper);

    const btn = wrapper.querySelector('.lang-btn');
    const dropdown = wrapper.querySelector('.lang-dropdown');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });

    wrapper.querySelectorAll('.lang-option').forEach(option => {
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        const lang = option.getAttribute('data-lang');
        await setLanguage(lang);
        
        wrapper.querySelector('.current-lang').textContent = SUPPORTED_LANGUAGES[lang].nativeName;
        wrapper.querySelectorAll('.lang-option').forEach(opt => {
          opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
        });
        dropdown.classList.remove('show');
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('i18n-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'i18n-styles';
    style.textContent = `
      .language-switcher {
        position: relative;
        display: inline-block;
      }
      .lang-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: rgba(28, 28, 42, 0.9);
        border: 1px solid rgba(148, 148, 168, 0.15);
        border-radius: 10px;
        color: #f4f4f6;
        font-family: inherit;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .lang-btn:hover {
        background: rgba(38, 38, 52, 0.95);
        border-color: rgba(148, 148, 168, 0.25);
      }
      .lang-btn svg {
        opacity: 0.7;
      }
      .lang-btn .chevron {
        transition: transform 0.2s ease;
      }
      .lang-dropdown.show + .lang-btn .chevron,
      .lang-btn:focus + .lang-dropdown .chevron {
        transform: rotate(180deg);
      }
      .lang-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 180px;
        background: rgba(22, 22, 34, 0.98);
        border: 1px solid rgba(148, 148, 168, 0.15);
        border-radius: 12px;
        padding: 8px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px);
        transition: all 0.2s ease;
        z-index: 1000;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      }
      .lang-dropdown.show {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      .lang-option {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 100%;
        padding: 10px 14px;
        background: transparent;
        border: none;
        border-radius: 8px;
        color: #f4f4f6;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
      }
      .lang-option:hover {
        background: rgba(74, 124, 255, 0.1);
      }
      .lang-option.active {
        background: rgba(74, 124, 255, 0.15);
      }
      .lang-option .lang-native {
        font-size: 0.92rem;
        font-weight: 500;
      }
      .lang-option .lang-english {
        font-size: 0.75rem;
        color: #9898a8;
        margin-top: 2px;
      }
      .lang-option.active .lang-native::after {
        content: ' ✓';
        color: #4a7cff;
      }
      
      /* Mobile dropdown opens upward */
      .mobile-lang-switcher .lang-dropdown {
        top: auto;
        bottom: calc(100% + 8px);
        transform: translateY(10px);
      }
      .mobile-lang-switcher .lang-dropdown.show {
        transform: translateY(0);
      }
      .mobile-lang-switcher .lang-btn .chevron {
        transform: rotate(180deg);
      }
      .mobile-lang-switcher .lang-dropdown.show + .lang-btn .chevron,
      .mobile-lang-switcher .lang-btn:focus + .lang-dropdown .chevron {
        transform: rotate(0deg);
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
  });

  return {
    init,
    t,
    setLanguage,
    getCurrentLanguage,
    getSupportedLanguages,
    translatePage,
    createLanguageSwitcher,
    SUPPORTED_LANGUAGES
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = I18n;
}
