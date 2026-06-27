import React, { createContext, useState, useContext, useEffect } from 'react';
import { I18nManager, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from '../constants/translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');
  const [isRTL, setIsRTL] = useState(false);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('user_language');
      if (savedLanguage) {
        setLanguage(savedLanguage);
        setIsRTL(savedLanguage === 'ar');
      }
    } catch (error) {
      console.log('Failed to load language', error);
    }
  };

  const changeLanguage = async (newLang) => {
    try {
      await AsyncStorage.setItem('user_language', newLang);
      setLanguage(newLang);

      const shouldBeRTL = newLang === 'ar';
      if (shouldBeRTL !== I18nManager.isRTL) {
        I18nManager.forceRTL(shouldBeRTL);
        I18nManager.allowRTL(shouldBeRTL);
        // Force app restart to apply RTL changes
        if (NativeModules.DevSettings && typeof NativeModules.DevSettings.reload === 'function') {
          NativeModules.DevSettings.reload();
        } else {
          // Fallback if DevSettings is not available (e.g. production without expo-updates)
          // The user will need to manually restart
        }
      }

      setIsRTL(shouldBeRTL);
    } catch (error) {
      console.log('Failed to change language', error);
    }
  };

  const t = (key) => {
    const langDict = translations[language] || translations['en'];
    return langDict[key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
