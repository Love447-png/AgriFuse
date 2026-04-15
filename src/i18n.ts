import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "app_name": "AgriFuse",
      "tagline": "Core Intelligence Engine",
      "protect_harvest": "Protect Your Harvest with AI",
      "camera_instruction": "Point your camera at the crop or upload a photo.",
      "open_camera": "Open Camera",
      "upload_photo": "Upload Photo",
      "analyzing": "Analyzing Crop Health...",
      "diagnosis": "Diagnosis",
      "severity": "Severity",
      "actions": "Immediate Actions",
      "global_network": "Global Network Active",
      "login_google": "Login with Google",
      "logout": "Logout",
      "dashboard": "Dashboard",
      "history": "History",
      "map": "Outbreak Map",
      "weather": "Local Weather",
      "market": "Market Trends",
      "alerts": "Outbreak Alerts",
      "listen": "Listen to Analysis",
      "stop_listening": "Stop Listening",
      "speak_now": "Speak Now...",
      "confidence": "Confidence Score",
      "severity_index": "Severity Index",
      "risk_factors": "Risk Factors",
      "mitigation": "Mitigation Strategy",
      "prevention": "Long-term Prevention",
      "economic_risk": "Economic Risk"
    }
  },
  hi: {
    translation: {
      "app_name": "एग्रीफ्यूज",
      "tagline": "कोर इंटेलिजेंस इंजन",
      "protect_harvest": "AI के साथ अपनी फसल की रक्षा करें",
      "camera_instruction": "अपना कैमरा फसल की ओर करें या फोटो अपलोड करें।",
      "open_camera": "कैमरा खोलें",
      "upload_photo": "फोटो अपलोड करें",
      "analyzing": "फसल के स्वास्थ्य का विश्लेषण...",
      "diagnosis": "निदान",
      "severity": "गंभीरता",
      "actions": "तत्काल कार्रवाई",
      "global_network": "वैश्विक नेटवर्क सक्रिय",
      "login_google": "गूगल के साथ लॉगिन करें",
      "logout": "लॉगआउट",
      "dashboard": "डैशबोर्ड",
      "history": "इतिहास",
      "map": "प्रकोप मानचित्र",
      "weather": "स्थानीय मौसम",
      "market": "बाजार के रुझान",
      "alerts": "प्रकोप अलर्ट",
      "listen": "विश्लेषण सुनें",
      "stop_listening": "सुनना बंद करें",
      "speak_now": "अब बोलें...",
      "confidence": "आत्मविश्वास स्कोर",
      "severity_index": "गंभीरता सूचकांक",
      "risk_factors": "जोखिम कारक",
      "mitigation": "शमन रणनीति",
      "prevention": "दीर्घकालिक रोकथाम",
      "economic_risk": "आर्थिक जोखिम"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
