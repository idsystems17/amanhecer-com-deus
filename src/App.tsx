/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Coffee, 
  Volume2, 
  VolumeX, 
  Check, 
  Settings, 
  Bell, 
  Star, 
  ChevronLeft, 
  ChevronRight, 
  Bookmark, 
  BookmarkCheck,
  RotateCcw,
  Sparkles,
  Info,
  Calendar,
  Eye,
  Smartphone,
  Share2,
  Mic,
  MicOff,
  HelpCircle,
  Lock,
  Unlock,
  LogOut,
  Edit2,
  Save,
  Trash2,
  User,
  X,
  Heart,
  Cloud,
  CloudOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getDevotionalForDay, getDayOfYear } from './data/devotionals';
import { AccessibilitySettings, UserSettings, Devotional, PrayerRequest } from './types';

// Firebase Integrations
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { 
  db, 
  auth, 
  loginWithGoogle, 
  logoutUser, 
  isUserAdmin, 
  handleFirestoreError, 
  OperationType 
} from './firebase';

// Portuguese spoken numbers helper
function parsePortugueseNumber(text: string): number | null {
  const normalized = text.toLowerCase().trim();
  
  // First, look for any direct digits in the text (e.g., "dia 45" -> 45)
  const digitMatch = normalized.match(/\b\d+\b/);
  if (digitMatch) {
    const num = parseInt(digitMatch[0], 10);
    if (!isNaN(num) && num >= 1 && num <= 365) return num;
  }

  // Word-based parsing mapping
  const wordToNum: { [key: string]: number } = {
    um: 1, dois: 2, tres: 3, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
    onze: 11, doze: 12, treze: 13, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
    trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
    cem: 100, cento: 100, duzentos: 200, trezentos: 300
  };

  // Replace Portuguese separators "e" with spaces and tokenize
  const tokens = normalized.replace(/\be\b/g, ' ').split(/\s+/).map(t => t.trim()).filter(Boolean);
  
  let sum = 0;
  let found = false;

  for (const token of tokens) {
    if (wordToNum[token] !== undefined) {
      sum += wordToNum[token];
      found = true;
    }
  }

  if (found && sum >= 1 && sum <= 365) {
    return sum;
  }

  return null;
}

export default function App() {
  const currentDayNum = getDayOfYear();
  
  // States configuration
  const [selectedDay, setSelectedDay] = useState<number>(currentDayNum);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [simulatedNotificationSent, setSimulatedNotificationSent] = useState(false);
const [showInstallHelp, setShowInstallHelp] = useState(false);
  // Speech Recognition (Voice Search) State
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  // Firebase Auth states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Firestore Core syncing state (falls back gracefully to localized static build)
  const [activeDevotional, setActiveDevotional] = useState<Devotional>(() => getDevotionalForDay(currentDayNum));
  const [isLoadingFirebase, setIsLoadingFirebase] = useState(false);

  // CMS/Pastor Fields Editor States
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editVerseText, setEditVerseText] = useState('');
  const [editVerseReference, setEditVerseReference] = useState('');
  const [editReflection, setEditReflection] = useState('');
  const [editAction, setEditAction] = useState('');
  const [editPrayer, setEditPrayer] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Prayer request states
  const [showPrayerForm, setShowPrayerForm] = useState(false);
  const [prayerName, setPrayerName] = useState('');
  const [prayerText, setPrayerText] = useState('');
  const [isSendingPrayer, setIsSendingPrayer] = useState(false);
  const [prayerSent, setPrayerSent] = useState(false);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [showPrayerRequests, setShowPrayerRequests] = useState(false);
  const [isLoadingPrayers, setIsLoadingPrayers] = useState(false);

  // Accessibility State Defaults (Optimized for seniors: Large, Serif, Standard Cappuccino Theme)
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(() => {
    try {
      const saved = localStorage.getItem('devocional_accessibility');
      return saved ? JSON.parse(saved) : {
        fontSize: 'large', // Default to Large for ease of reading
        contrast: 'standard', // Cappuccino mode
        fontFamily: 'serif', // Traditional reading font
        audioSpeed: 0.9 // Slightly slower default for clearer listening
      };
    } catch {
      return {
        fontSize: 'large',
        contrast: 'standard',
        fontFamily: 'serif',
        audioSpeed: 0.9
      };
    }
  });

  // Reading Tracker state
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem('devocional_user_settings');
      return saved ? JSON.parse(saved) : {
        notificationTime: '07:00',
        notificationsEnabled: true,
        readDays: [],
        starredDays: []
      };
    } catch {
      return {
        notificationTime: '07:00',
        notificationsEnabled: true,
        readDays: [],
        starredDays: []
      };
    }
  });

  // Cloud sync state (progress synced to the logged-in Google account)
  const [isSyncingProgress, setIsSyncingProgress] = useState(false);
  const userSettingsRef = useRef(userSettings);
  useEffect(() => {
    userSettingsRef.current = userSettings;
  }, [userSettings]);

  // Audio References
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const cancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);

  // Firebase auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsAdmin(false);
        return;
      }
      
      const isBootstrapAdmin = isUserAdmin(user.email);
      if (isBootstrapAdmin) {
        setIsAdmin(true);
        return;
      }
      
      try {
        const adminDocRef = doc(db, 'admins', user.uid);
        const adminDocSnap = await getDoc(adminDocRef);
        setIsAdmin(adminDocSnap.exists());
      } catch (err) {
        console.warn('Erro ao verificar permissões do Firestore:', err);
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync reading progress (Marcar como Lido / Favoritos) with the logged-in Google account,
  // so it's the same on every device (celular, computador etc), not just this browser.
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;

    const syncProgress = async () => {
      setIsSyncingProgress(true);
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (!isMounted) return;

        if (userDocSnap.exists()) {
          const cloud = userDocSnap.data() as Partial<UserSettings>;
          const local = userSettingsRef.current;
          setUserSettings({
            notificationTime: cloud.notificationTime ?? local.notificationTime,
            notificationsEnabled: cloud.notificationsEnabled ?? local.notificationsEnabled,
            readDays: Array.from(new Set([...(cloud.readDays || []), ...local.readDays])),
            starredDays: Array.from(new Set([...(cloud.starredDays || []), ...local.starredDays])),
          });
        } else {
          await setDoc(userDocRef, userSettingsRef.current);
        }
      } catch (err) {
        console.warn('Erro ao sincronizar progresso do usuário:', err);
      } finally {
        if (isMounted) setIsSyncingProgress(false);
      }
    };

    syncProgress();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Fetch devotional for selectedDay, either from Firestore (if customized) or from local mock structure
  useEffect(() => {
    let isMounted = true;
    setIsLoadingFirebase(true);

    const loadDevotional = async () => {
      try {
        const docRef = doc(db, 'devotionals', String(selectedDay));
        const docSnap = await getDoc(docRef);
        
        if (isMounted) {
          if (docSnap.exists()) {
            setActiveDevotional(docSnap.data() as Devotional);
          } else {
            setActiveDevotional(getDevotionalForDay(selectedDay));
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar devocional customizada do Firebase, fallback local:', err);
        if (isMounted) {
          setActiveDevotional(getDevotionalForDay(selectedDay));
        }
      } finally {
        if (isMounted) {
          setIsLoadingFirebase(false);
        }
      }
    };

    loadDevotional();
    return () => {
      isMounted = false;
    };
  }, [selectedDay]);

  // Sync state mutations to local storage
  useEffect(() => {
    localStorage.setItem('devocional_accessibility', JSON.stringify(accessibility));
  }, [accessibility]);

  // Aplica/remove classe 'dark' no <html> conforme o modo de contraste escolhido
  useEffect(() => {
    document.documentElement.classList.toggle('dark', accessibility.contrast === 'high-contrast-dark');
  }, [accessibility.contrast]);

  // Aplica/remove classe no <html> para alternar fonte global
  useEffect(() => {
    document.documentElement.classList.toggle('font-sans-override', accessibility.fontFamily === 'sans');
  }, [accessibility.fontFamily]);
  useEffect(() => {
    localStorage.setItem('devocional_user_settings', JSON.stringify(userSettings));
    if (currentUser) {
      const userDocRef = doc(db, 'users', currentUser.uid);
      setDoc(userDocRef, userSettings, { merge: true }).catch((err) => {
        console.warn('Erro ao salvar progresso na nuvem:', err);
      });
    }
  }, [userSettings, currentUser]);

  // Clean play state on active day movement
  useEffect(() => {
    stopNarration();
    setIsEditing(false);
  }, [selectedDay]);

  const isRead = userSettings.readDays.includes(selectedDay);
  const isStarred = userSettings.starredDays.includes(selectedDay);

  // Google login flow for pastors and church members
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      if (auth.currentUser) {
        await logoutUser();
      }
      const user = await loginWithGoogle();
      if (user) {
        let adminCheck = isUserAdmin(user.email);
        
        if (!adminCheck) {
          try {
            const adminDocRef = doc(db, 'admins', user.uid);
            const adminDocSnap = await getDoc(adminDocRef);
            adminCheck = adminDocSnap.exists();
          } catch (err) {
            console.error('Erro ao verificar admin na coleção:', err);
          }
        }
        
        setIsAdmin(adminCheck);
        
        if (adminCheck) {
          speakFeedback("Olá! Acesso administrativo concedido.");
          playAlarmeChime();
        } else {
          speakFeedback(`Olá ${user.displayName || 'Irmão'}! Você fez login com sucesso.`);
        }
      }
    } catch (err) {
      console.error("Login principal error: ", err);
      speakFeedback("Falha ao entrar com o Google.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout routine
  const handlePastorLogout = async () => {
    try {
      await logoutUser();
      setIsEditing(false);
      speakFeedback("Sessão encerrada com sucesso.");
    } catch (err) {
      console.error(err);
    }
  };

  // Launch editing panel
  const handleStartEditing = () => {
    if (!isAdmin) return;
    setEditTitle(activeDevotional.title);
    setEditVerseText(activeDevotional.verseText);
    setEditVerseReference(activeDevotional.verseReference);
    setEditReflection(activeDevotional.reflection);
    setEditAction(activeDevotional.action);
    setEditPrayer(activeDevotional.prayer);
    setEditCategory(activeDevotional.category || 'Estudo');
    setIsEditing(true);
    speakFeedback("Painel de Edição do Pastor ativado.");
  };

  // Saves to Firestore
  const handleSaveDevotional = async () => {
    if (!isAdmin) return;
    if (!editTitle.trim() || !editVerseText.trim() || !editReflection.trim()) {
      alert("Por favor, preencha o Título, o Versículo e a Reflexão para salvar.");
      return;
    }

    setIsSaving(true);
    try {
      const docRef = doc(db, 'devotionals', String(selectedDay));
      const updatedDevotional: Devotional = {
        day: selectedDay,
        title: editTitle.trim(),
        verseText: editVerseText.trim(),
        verseReference: editVerseReference.trim(),
        reflection: editReflection.trim(),
        action: editAction.trim(),
        prayer: editPrayer.trim(),
        category: editCategory.trim() || 'Estudo',
        lastEditedBy: currentUser?.email || 'Pastor',
        lastEditedAt: new Date().toISOString()
      };

      await setDoc(docRef, updatedDevotional);
      setActiveDevotional(updatedDevotional);
      setIsEditing(false);
      speakFeedback("Mudanças salvas com sucesso!");
      playAlarmeChime();
    } catch (err) {
      console.error("SetDoc error: ", err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `devotionals/${selectedDay}`);
      } catch (parsedError: any) {
        alert(`Erro de segurança do Firebase: ${parsedError.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Reverts edits to BASE_DEVOTIONALS values
  const handleRestoreDefault = async () => {
    if (!isAdmin) return;
    if (window.confirm("Você deseja mesmo apagar suas alterações de hoje e restaurar a mensagem original oficial do aplicativo?")) {
      setIsSaving(true);
      try {
        const docRef = doc(db, 'devotionals', String(selectedDay));
        await deleteDoc(docRef);
        
        // Revert to default base
        const originalDev = getDevotionalForDay(selectedDay);
        setActiveDevotional(originalDev);
        setIsEditing(false);
        speakFeedback("Mensagem original restaurada.");
      } catch (err) {
        console.error("DeleteDoc error: ", err);
        try {
          handleFirestoreError(err, OperationType.DELETE, `devotionals/${selectedDay}`);
        } catch (parsedError: any) {
          alert(`Erro ao restaurar: ${parsedError.message}`);
        }
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Day year statistics calculations
  const totalReadCount = userSettings.readDays.length;
  const progressPercent = Math.round((totalReadCount / 365) * 100);

  // Toggle mark as read
  const handleToggleRead = (dayNum: number) => {
    setUserSettings(prev => {
      const alreadyRead = prev.readDays.includes(dayNum);
      const readDays = alreadyRead 
        ? prev.readDays.filter(d => d !== dayNum)
        : [...prev.readDays, dayNum];
      return { ...prev, readDays };
    });
  };

  // Toggle star / favorite
  const handleToggleStar = (dayNum: number) => {
    setUserSettings(prev => {
      const alreadyStarred = prev.starredDays.includes(dayNum);
      const starredDays = alreadyStarred 
        ? prev.starredDays.filter(d => d !== dayNum)
        : [...prev.starredDays, dayNum];
      return { ...prev, starredDays };
    });
  };

  /**
   * Action: triggers Audio Narration using Gemini TTS server proxy or local client-side synthesis.
   */
  const stopNarration = () => {
    if (cancelTimeoutRef.current) {
      clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    speechUtteranceRef.current = null;
    setIsPlaying(false);
  };

  const handlePlayNarration = () => {
    if (isPlaying) {
      stopNarration();
      return;
    }
    if (!('speechSynthesis' in window)) return;

    stopNarration();

    try {
      const textToSpeak = `Amanhecer com Deus. ${activeDevotional.title}. Versículo: ${activeDevotional.verseText}, ${activeDevotional.verseReference}. Reflexão: ${activeDevotional.reflection}. Atitude prática: ${activeDevotional.action}. Oração: ${activeDevotional.prayer}`;

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'pt-BR';
      utterance.rate = accessibility.audioSpeed;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      speechUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsPlaying(false);
    }
  };

  const speakFeedback = (message: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  /**
   * ELDER-FRIENDLY VOICE COMMAND / SEARCH HANDLER (webkitSpeechRecognition)
   * Captures voice and guides user directly!
   */
  const handleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("A busca por voz necessita do Google Chrome ou Safari ativo no celular.");
      speakFeedback("Aparelho sem suporte de voz. Por favor, utilize o navegador Chrome.");
      return;
    }

    if (isListeningVoice) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListeningVoice(false);
      return;
    }

    stopNarration();
    setVoiceFeedback("Ouvindo... Diga para onde quer ir.");
    
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListeningVoice(true);
      };

      recognition.onresult = (event: any) => {
        const spokenText = event.results[0][0].transcript.toLowerCase();
        setVoiceFeedback(`Você disse: "${spokenText}"`);
        
        // Command 1: "leitura de hoje" or "hoje"
        if (spokenText.includes("hoje") || spokenText.includes("leitura de hoje") || spokenText.includes("dia de hoje") || spokenText.includes("amanhecer")) {
          setSelectedDay(currentDayNum);
          speakFeedback("Certo, carregando a mensagem de hoje!");
          return;
        }

        // Command 2: Navigation commands
        if (spokenText.includes("amanhã") || spokenText.includes("amanha") || spokenText.includes("próximo") || spokenText.includes("proximo") || spokenText.includes("avançar") || spokenText.includes("depois")) {
          setSelectedDay(prev => Math.min(365, prev + 1));
          speakFeedback("Indo para o próximo dia.");
          return;
        }
        if (spokenText.includes("ontem") || spokenText.includes("anterior") || spokenText.includes("antes") || spokenText.includes("voltar")) {
          setSelectedDay(prev => Math.max(1, prev - 1));
          speakFeedback("Voltando para o dia anterior.");
          return;
        }

        // Command 3: Direct day of year matching
        const parsedNum = parsePortugueseNumber(spokenText);
        if (parsedNum !== null) {
          setSelectedDay(parsedNum);
          speakFeedback(`Carregando dia ${parsedNum}`);
          return;
        }

        // No match guide
        speakFeedback("Comando não reconhecido. Você pode dizer: 'leitura de hoje' ou falar qualquer número de dia.");
      };

      recognition.onerror = (e: any) => {
        console.error("Speech Recognition Err:", e);
        setVoiceFeedback("Não consegui ouvir bem, clique para tentar novamente.");
        setIsListeningVoice(false);
      };

      recognition.onend = () => {
        setIsListeningVoice(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListeningVoice(false);
    }
  };

  const playAlarmeChime = () => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.25, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(523.25, now, 0.4);       // C5 (Dó)
      playTone(659.25, now + 0.15, 0.4); // E5 (Mi)
      playTone(783.99, now + 0.3, 0.6);  // G5 (Sol)
    } catch (err) {
      console.warn("AudioContext chime failed:", err);
    }
  };

  // Simulated push alarm demonstration with real audible chimes and feedback for seniors
  const handleTestNotification = () => {
    playAlarmeChime();
    speakFeedback("Amanhecer com Deus! Hora diária de oração e leitura.");
    setSimulatedNotificationSent(true);
    setTimeout(() => {
      setSimulatedNotificationSent(false);
    }, 8000);

    // Request official system notification permission if supported
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification("Amanhecer com Deus ☕", {
            body: "Sua hora diária de reflexão espiritual com a SIB Jardim Tropical!",
            tag: "amanhecer"
          });
        }
      });
    }
  };

  // Clean stats history
  const handleResetProgress = () => {
    if (window.confirm('Deseja mesmo redefinir seu histórico de leitura anual de devocionais?')) {
      setUserSettings(prev => ({ ...prev, readDays: [] }));
    }
  };

  // Format date helper matching editorial style
  const getFormattedDate = (dayNum: number) => {
    try {
      const year = new Date().getFullYear();
      const date = new Date(year, 0, dayNum);
      const day = date.toLocaleDateString('pt-BR', { day: 'numeric' });
      const monthLabel = date.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
      const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      return { day, monthLabel, weekday: weekdayCapitalized };
    } catch {
      return { day: String(dayNum), monthLabel: 'DIA', weekday: 'Estudo Diário' };
    }
  };

  const dateInfo = getFormattedDate(selectedDay);

  // Dynamic style generators to support high contrast options + Editorial aesthetics
  const getThemeBg = () => {
    switch (accessibility.contrast) {
      case 'high-contrast-light': return 'bg-[#FFFFFF]';
      case 'high-contrast-dark': return 'bg-[#000000]';
      case 'standard':
      default:
        return 'bg-[#FAF9F6]'; // Real editorial off-white
    }
  };

  const getThemeText = () => {
    switch (accessibility.contrast) {
      case 'high-contrast-light': return 'text-black';
      case 'high-contrast-dark': return 'text-amber-200';
      case 'standard':
      default:
        return 'text-[#1A1A1A]'; // Rich reading coal
    }
  };

  const getThemeBorder = () => {
    switch (accessibility.contrast) {
      case 'high-contrast-light': return 'border-black border-2';
      case 'high-contrast-dark': return 'border-amber-400/50 border';
      case 'standard':
      default:
        return 'border-[#E5E3DF] border-b md:border-b-0'; // Fine warm gray hairline
    }
  };

  const getSidebarBg = () => {
    switch (accessibility.contrast) {
      case 'high-contrast-light': return 'bg-white';
      case 'high-contrast-dark': return 'bg-zinc-950';
      case 'standard':
      default:
        return 'bg-[#FFFFFF]';
    }
  };

  const getAccentText = () => {
    switch (accessibility.contrast) {
      case 'high-contrast-light': return 'text-[#B45309] font-extrabold';
      case 'high-contrast-dark': return 'text-amber-300 font-extrabold';
      case 'standard':
      default:
        return 'text-amber-800';
    }
  };

  const getSubCardBg = () => {
    switch (accessibility.contrast) {
      case 'high-contrast-light': return 'bg-white border-2 border-black';
      case 'high-contrast-dark': return 'bg-zinc-900 border border-amber-400';
      case 'standard':
      default:
        return 'bg-amber-50/50 border border-[#E5E3DF]';
    }
  };

  const handleSendPrayerRequest = async () => {
    if (!prayerText.trim()) return;
    setIsSendingPrayer(true);
    try {
      await addDoc(collection(db, 'prayer_requests'), {
        name: prayerName.trim() || 'Anônimo',
        request: prayerText.trim(),
        createdAt: new Date().toISOString(),
      });
      setPrayerSent(true);
      setPrayerName('');
      setPrayerText('');
      setTimeout(() => {
        setPrayerSent(false);
        setShowPrayerForm(false);
      }, 3000);
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar pedido. Tente novamente.');
    } finally {
      setIsSendingPrayer(false);
    }
  };

  const handleLoadPrayerRequests = async () => {
    if (!isAdmin) return;
    setIsLoadingPrayers(true);
    try {
      const q = query(collection(db, 'prayer_requests'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PrayerRequest));
      setPrayerRequests(requests);
      setShowPrayerRequests(true);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar pedidos de oração.');
    } finally {
      setIsLoadingPrayers(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Amanhecer com Deus: ${activeDevotional.title}`,
        text: `"${activeDevotional.verseText}" - Leia no Devocional Diário Amanhecer com Deus`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      alert(`Mensagem pronta para compartilhar: "${activeDevotional.title}" — ${activeDevotional.verseReference}`);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${getThemeBg()} ${getThemeText()}`}>
      
      {/* Pastor Management Banner */}
      {currentUser && (
        <div className={`w-full text-center py-2 px-4 flex flex-wrap items-center justify-center gap-3 text-xs font-sans font-bold shadow-xs ${isAdmin ? 'bg-amber-600 text-white' : 'bg-stone-100 dark:bg-zinc-900 dark:text-stone-300 border-b border-stone-200 dark:border-zinc-800 text-stone-700'}`}>
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5" />
            <span>Conectado como {currentUser.email}</span>
            {isAdmin ? (
              <span className="bg-white text-amber-700 text-[10px] uppercase font-black px-2 py-0.5 rounded-full ml-1">PASTOR AUTORIZADO</span>
            ) : (
              <span className="bg-stone-350 text-stone-800 text-[10px] uppercase font-black px-2 py-0.5 rounded-full ml-1">PROGRESSO SINCRONIZADO</span>
            )}
          </div>
          <button 
            onClick={handlePastorLogout}
            className="underline hover:text-amber-100 font-extrabold text-[11px] ml-1"
          >
            Sair
          </button>
        </div>
      )}

      {/* BRANDING TOP HEADER WITH LOGO PLACEHOLDER, APP TITLE & DATE */}
      <header className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-2 select-none">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#E5E3DF] dark:border-zinc-800 pb-5">
          
          {/* Logo & Brand title row */}
          <div className="flex items-center gap-4 text-left self-auto select-none">
            <img src="/logo-sib.png" alt="SIB" className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex-none object-contain" />
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-black tracking-tight text-[#4e3629] dark:text-amber-100 leading-tight">
                Amanhecer com Deus
              </h1>
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 mt-0.5 select-none">
                <span className="text-xs font-extrabold text-[#B45309] dark:text-amber-400 uppercase tracking-widest font-sans">
                  SIB Jardim Tropical
                </span>
                <span className="hidden sm:inline text-stone-300 dark:text-stone-700 select-none">•</span>
                <span className="text-[11px] sm:text-xs text-stone-500 dark:text-stone-400 font-serif italic block">
                  Devocional Diário Oficial
                </span>
              </div>
            </div>
          </div>

          {/* Quick Date Display */}
          <div className="text-center sm:text-right bg-amber-50/60 dark:bg-zinc-900/40 border border-[#E5E3DF] dark:border-neutral-850 px-5 py-2.5 rounded-2xl shrink-0">
            <div className="text-stone-400 text-xs font-bold uppercase tracking-widest">Estudo de Hoje</div>
            <div className="text-2xl font-serif font-black">{dateInfo.day} {dateInfo.monthLabel}</div>
            <div className="text-xs text-amber-800 dark:text-amber-400 font-medium italic">{dateInfo.weekday}</div>
          </div>

        </div>
      </header>

      {/* CORE CONTENT BLOCK (DEVOTIONAL TEXT IMMEDIATELY VISIBLE AND INTERACTIVE) */}
      <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col pointer-events-auto">
        
        {/* UPPER TOOLBAR (PREV/NEXT BUTTONS & SYSTEM PREFERENCES WITH GEAR ICON) */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-3 mb-6 bg-stone-100/70 dark:bg-zinc-900/70 p-2 sm:p-3 rounded-2xl border border-stone-200/50 flex-wrap sm:flex-nowrap">
          
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setSelectedDay(prev => Math.max(1, prev - 1))}
              disabled={selectedDay === 1}
              className="px-2.5 sm:px-4 py-2 bg-white dark:bg-zinc-800 border rounded-xl hover:bg-stone-50 dark:hover:bg-zinc-700 disabled:opacity-30 font-bold text-[11px] sm:text-xs flex items-center gap-1 shrink-0 min-h-[44px]"
              title="Devocional Anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-amber-700" />
              <span>Anterior</span>
            </button>
            <span className="text-[11px] sm:text-xs font-bold px-1 sm:px-2 font-serif text-stone-600 dark:text-stone-300 min-w-[52px] text-center">{dateInfo.day} {dateInfo.monthLabel.slice(0, 3)}</span>
            <button
              onClick={() => setSelectedDay(prev => Math.min(365, prev + 1))}
              disabled={selectedDay === 365}
              className="px-2.5 sm:px-4 py-2 bg-white dark:bg-zinc-800 border rounded-xl hover:bg-stone-50 dark:hover:bg-zinc-700 disabled:opacity-30 font-bold text-[11px] sm:text-xs flex items-center gap-1 shrink-0 min-h-[44px]"
              title="Próxima Devocional"
            >
              <span>Próximo</span>
              <ChevronRight className="w-3.5 h-3.5 text-amber-700" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Pastor Access Button */}
            {!currentUser || !isAdmin ? (
              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-white dark:bg-zinc-850 hover:bg-amber-50 rounded-xl border transition shrink-0"
                title={currentUser ? "Mudar conta de pastor (Login)" : "Acesso de Pastor (Login)"}
              >
                {isLoggingIn ? (
                  <div className="w-4 h-4 border-2 border-amber-800 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Lock className="w-4 h-4 text-amber-850 dark:text-amber-400" />
                )}
              </button>
            ) : (
              <button
                onClick={handleStartEditing}
                disabled={isEditing}
                className={`w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl border transition shrink-0 ${isEditing ? 'bg-amber-600/20 text-amber-600 border-amber-500/50' : 'bg-amber-600 border-amber-600 text-white hover:bg-amber-700'}`}
                title="Editar esta Devocional"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handleShare}
              className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-white dark:bg-zinc-850 hover:bg-amber-50 rounded-xl border transition shrink-0"
              title="Compartilhar mensagem"
            >
              <Share2 className="w-4 h-4 text-stone-600 dark:text-stone-300" />
            </button>

            <button
              onClick={() => setShowSettingsDrawer(true)}
              className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-[#4e3629] text-white hover:bg-stone-850 rounded-xl transition shrink-0"
              title="Ajustes de Letra e Voz (Engrenagem)"
            >
              <Settings className="w-4 h-4 text-white" />
            </button>
          </div>

        </div>

        {/* FIXED ALERTS TOAST (COMPACT AND CONVENIENT FOR ELDERLY NAVIGATION) */}
        <AnimatePresence>
          {simulatedNotificationSent && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-6 right-6 left-6 sm:left-auto sm:w-96 bg-[#4e3629] text-amber-50 p-4 rounded-2xl shadow-xl z-50 border border-amber-600/30 flex items-start gap-3"
            >
              <div className="text-2xl mt-0.5">🔔</div>
              <div className="flex-1 text-xs">
                <p className="font-bold uppercase tracking-widest text-[10px] text-amber-300">Teste do Alarme</p>
                <p className="font-serif leading-relaxed mt-0.5">☕ "Amanhecer com Deus" - Hora de iniciar a sua leitura diária.</p>
              </div>
              <button 
                onClick={() => setSimulatedNotificationSent(false)} 
                className="text-stone-300 hover:text-white font-bold p-0.5 text-xs self-start"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MAIN DEVOTIONAL ELEMENT (THE TEXT READABLE SEGMENT OR PASTOR CMS EDITOR!) */}
        {isEditing ? (
          <div className="bg-white dark:bg-[#151515] rounded-3xl border-2 border-amber-600 p-6 sm:p-10 shadow-lg mb-8 space-y-6">
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-700" />
                <h3 className="text-xl sm:text-2xl font-serif font-black text-[#4e3629] dark:text-amber-100">
                  Painel de Edição — Dia {selectedDay}
                </h3>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs font-bold leading-none"
              >
                Cancelar
              </button>
            </div>

            {/* Title & Category Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Tema da Mensagem</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="Ex: Fé, Oração, Milagres"
                  className="w-full p-3 border rounded-xl text-base font-bold bg-stone-50 dark:bg-zinc-900 border-[#E5E3DF] dark:border-zinc-800"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Título Principal</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Ex: Confiança Inabalável"
                  className="w-full p-3 border rounded-xl text-base font-bold bg-stone-50 dark:bg-zinc-900 border-[#E5E3DF] dark:border-zinc-800"
                />
              </div>
            </div>

            {/* Verse & Reference Inputs */}
            <div className="space-y-3 p-4 bg-amber-50/30 dark:bg-zinc-900/40 rounded-2xl border border-amber-200/50">
              <span className="text-xs font-black uppercase tracking-wider text-amber-800">📖 Palavra Bíblica de Apoio</span>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">Texto Bilbíco</label>
                  <textarea
                    rows={3}
                    value={editVerseText}
                    onChange={(e) => setEditVerseText(e.target.value)}
                    placeholder="Cole aqui o texto do versículo bíblico..."
                    className="w-full p-3 border rounded-xl text-sm font-serif italic bg-white dark:bg-zinc-950 border-[#E5E3DF] dark:border-zinc-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">Referência do Livro</label>
                  <input
                    type="text"
                    value={editVerseReference}
                    onChange={(e) => setEditVerseReference(e.target.value)}
                    placeholder="Ex: Salmos 23:1"
                    className="w-full p-3 border rounded-xl text-sm font-bold bg-white dark:bg-zinc-950 border-[#E5E3DF] dark:border-zinc-800"
                  />
                </div>
              </div>
            </div>

            {/* Core Reflection Area */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Reflexão Teológica / Mensagem</label>
              <textarea
                rows={10}
                value={editReflection}
                onChange={(e) => setEditReflection(e.target.value)}
                placeholder="Escreva a mensagem divina para abençoar a igreja..."
                className="w-full p-4 border rounded-xl text-base font-serif leading-relaxed bg-stone-50 dark:bg-zinc-900 border-[#E5E3DF] dark:border-zinc-800"
              />
            </div>

            {/* Practical Action Area */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Atitude Prática Diária</label>
              <input
                type="text"
                value={editAction}
                onChange={(e) => setEditAction(e.target.value)}
                placeholder="Ex: Tire no mínimo 10 minutos hoje para ler a Bíblia..."
                className="w-full p-3 border rounded-xl text-base font-serif italic bg-stone-50 dark:bg-zinc-900 border-[#E5E3DF] dark:border-zinc-800"
              />
            </div>

            {/* Prayer Input */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Oração Diária Recomendada</label>
              <textarea
                rows={3}
                value={editPrayer}
                onChange={(e) => setEditPrayer(e.target.value)}
                placeholder="Ex: Querido Pai, nos apoie a ter compaixão..."
                className="w-full p-3 border rounded-xl text-base font-serif italic bg-stone-50 dark:bg-zinc-900 border-[#E5E3DF] dark:border-zinc-800"
              />
            </div>

            {/* Editing Action Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-stone-200 dark:border-zinc-800 pt-5">
              <button
                type="button"
                onClick={handleRestoreDefault}
                disabled={isSaving}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 dark:text-red-400 dark:bg-red-950/20 rounded-xl text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Restaurar Mensagem Original</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 rounded-xl text-xs font-bold uppercase tracking-wide transition disabled:opacity-40"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveDevotional}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow active:scale-95 transition disabled:opacity-40"
                >
                  {isSaving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Gravar e Deixar Online</span>
                </button>
              </div>
            </div>
          </div>
        ) : activeDevotional.isEmpty && !isLoadingFirebase ? (
          <div className="bg-white dark:bg-[#151515] rounded-3xl border-2 border-dashed border-amber-200 dark:border-zinc-700 p-10 sm:p-14 shadow-sm mb-8 text-center space-y-4 select-none">
            <div className="text-5xl">🌅</div>
            <h2 className="text-2xl font-serif font-bold text-stone-400 dark:text-stone-500">
              Devocional em preparo
            </h2>
            <p className="text-stone-400 dark:text-stone-500 font-serif italic text-base leading-relaxed">
              O pastor ainda não preparou a mensagem para este dia.<br />
              Volte mais tarde para receber a palavra de Deus.
            </p>
            {isAdmin && (
              <button
                onClick={handleStartEditing}
                className="mt-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm transition inline-flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Criar mensagem para este dia
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#151515] rounded-3xl border border-[#E5E3DF] dark:border-zinc-850 p-6 sm:p-10 shadow-sm transition-all duration-150 mb-8 space-y-8 select-text">
            
            {/* Category Theme Flag */}
            <div className="flex items-center justify-between gap-1.5 text-stone-400 dark:text-stone-500 font-serif italic text-sm">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-amber-600" />
                <span>Tema diário: {activeDevotional.category}</span>
              </div>

            </div>

            {/* 1. SECTOR BIBLICAL VERSE COMPONENT */}
            <div className="bg-[#FAF9F6] dark:bg-zinc-900 border-l-4 border-amber-600 pl-5 pr-3 py-4 rounded-r-2xl shadow-xs">
              <blockquote className={`font-serif italic leading-relaxed text-stone-700 dark:text-amber-100/90 ${accessibility.fontSize === 'normal' ? 'text-lg' : accessibility.fontSize === 'large' ? 'text-xl font-bold' : 'text-2xl font-black'}`}>
                &ldquo;{activeDevotional.verseText}&rdquo;
              </blockquote>
              <div className={`mt-3 text-xs uppercase tracking-widest font-extrabold font-sans flex items-center gap-1.5 ${getAccentText()}`}>
                — {activeDevotional.verseReference}
              </div>
            </div>

            {/* 2. CHOSEN ARTICLE TITLE */}
            <h2 className="text-3xl sm:text-4xl font-serif font-black leading-tight tracking-tight text-stone-900 dark:text-white">
              {activeDevotional.title}
            </h2>

            {/* 3. CORE DEVOTIONAL BODY TEXT */}
            <div className={`font-serif leading-relaxed text-[#1A1A1A] dark:text-[#EAE9E6] text-justify space-y-6 ${accessibility.fontSize === 'normal' ? 'text-lg' : accessibility.fontSize === 'large' ? 'text-xl' : 'text-2xl'}`}>
              {activeDevotional.reflection.split('\n').map((para, idx) => (
                <p key={idx} className="indent-4 leading-relaxed font-serif">
                  {para}
                </p>
              ))}
            </div>

            {/* 4. PRACTICAL ACTION MODULE */}
            <div className={`rounded-xl p-6 sm:p-8 shadow-xs border transition-all ${getSubCardBg()}`}>
              <div className={`text-xs uppercase tracking-widest font-extrabold mb-3 flex items-center gap-2 ${getAccentText()}`}>
                <Coffee className="w-5 h-5 text-amber-700 animate-pulse" />
                Atitude Prática para Hoje
              </div>
              <p className={`font-serif italic leading-relaxed text-stone-850 dark:text-stone-300 ${accessibility.fontSize === 'normal' ? 'text-lg' : accessibility.fontSize === 'large' ? 'text-xl font-medium' : 'text-2xl font-black'}`}>
                &ldquo;{activeDevotional.action}&rdquo;
              </p>
            </div>

            {/* 5. SUGGESTED PRAYER */}
            <div className="border-t border-[#E5E3DF] dark:border-zinc-800 pt-6 mt-6">
              <div className={`text-xs uppercase tracking-widest font-extrabold mb-3 flex items-center gap-2 ${getAccentText()}`}>
                <Sparkles className="w-5 h-5" />
                Oração Diária Recomendada
              </div>
              <p className={`font-serif italic leading-relaxed text-stone-700 dark:text-stone-300 ${accessibility.fontSize === 'normal' ? 'text-lg' : accessibility.fontSize === 'large' ? 'text-xl font-medium' : 'text-2xl font-black'}`}>
                &ldquo;{activeDevotional.prayer}&rdquo;
              </p>
            </div>

          </div>
        )}

        {/* PRIMARY TOUCH INTERACTION FOOTER FOR ELDER COGNITIVE CONVENIENCE */}
        <div className="bg-[#FAF9F6] dark:bg-zinc-950 border border-[#E5E3DF] dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-md mb-8 space-y-6">
          
          <h3 className="text-sm font-sans font-black uppercase tracking-widest text-[#B45309] text-center mb-1">
            ☕ Controles Rápidos do Amanhecer
          </h3>

          {/* 1. HUGE LISTEN TO DEVOTIONAL SPEAKER BUTTON - "Ouvir" */}
          <button 
            id="play_audio_narrate"
            onClick={handlePlayNarration}
            disabled={isLoadingFirebase}
            className="w-full h-20 px-6 bg-[#B45309] hover:bg-amber-700 text-white rounded-3xl flex items-center justify-center gap-4 shadow-lg active:scale-95 transition-all text-left"
            title="Narrar devocional por voz"
          >
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              {isPlaying ? (
                <VolumeX className="w-6 h-6 text-white stroke-[2.5px]" />
              ) : (
                <Volume2 className="w-6 h-6 text-white stroke-[2.5px]" />
              )}
            </div>

            <div className="text-left select-none flex-1">
              <p className="text-2xl font-black tracking-tight leading-none mb-1">
                {isPlaying ? 'Parar' : 'Ouvir'}
              </p>
              <p className="text-xs opacity-85 leading-snug">
                {isPlaying ? 'Toque para silenciar' : 'Escutar de forma simples'}
              </p>
            </div>
          </button>

          {/* 2. ELDER VOICE COMMAND MICROPHONE BUTTON (SEARCH BY SPEAKING) - "Falar" */}
          <div className="space-y-2">
            <button
              onClick={handleVoiceSearch}
              className={`w-full h-20 px-6 rounded-3xl flex items-center justify-center gap-4 shadow-md transition-all border-2 text-left
                ${isListeningVoice 
                  ? 'bg-red-50 border-red-500 text-red-950 animate-pulse' 
                  : 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-950'}
              `}
              title="Dar comando por voz"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isListeningVoice ? 'bg-red-500 text-white' : 'bg-amber-600 text-white font-bold'}`}>
                <Mic className="w-5 h-5" />
              </div>
              <div className="text-left select-none flex-1">
                <p className="text-2xl font-black leading-none mb-1">
                  {isListeningVoice ? 'Ouvindo...' : 'Falar'}
                </p>
                <p className="text-xs opacity-85 leading-snug">
                  {isListeningVoice ? 'Diga o comando agora...' : 'Pesquise ou mude de dia por voz'}
                </p>
              </div>
            </button>

            {/* Voice Helper Info / feedback transcript */}
            <div className="bg-stone-50 dark:bg-zinc-900 border border-[#E5E3DF] dark:border-zinc-800 p-3 rounded-xl text-center">
              {voiceFeedback ? (
                <p className="text-xs font-bold text-amber-900 dark:text-amber-400 italic">
                  🔊 {voiceFeedback}
                </p>
              ) : (
                <p className="text-[11px] text-stone-500 leading-normal">
                  💡 <strong>Comando de Voz Fácil:</strong> Clique em <strong>Falar</strong> e diga <i>"hoje"</i>, <i>"dia 15"</i> ou <i>"avançar"</i>.
                </p>
              )}
            </div>
          </div>

          {/* 3. SIMPLER/COMPACT MARK AS READ ACTION BUTTON */}
          <div className="w-full">
            <button 
              id="mark_read_toggle"
              onClick={() => handleToggleRead(selectedDay)}
              className={`h-16 w-full rounded-2xl flex items-center justify-center gap-3 shadow-md transition-all px-6
                ${isRead 
                  ? 'bg-emerald-100 border-2 border-emerald-500 text-emerald-950 font-black' 
                  : 'bg-[#1a1a1a] hover:bg-stone-850 text-white font-black'}
              `}
            >
              {isRead ? (
                <>
                  <BookmarkCheck className="w-6 h-6 text-emerald-600 shrink-0 stroke-[3px]" />
                  <span className="text-lg font-black uppercase tracking-tight">Estudo Concluído!</span>
                </>
              ) : (
                <>
                  <Check className="w-6 h-6 text-white shrink-0 stroke-[3px]" />
                  <span className="text-lg font-black uppercase tracking-tight">Marcar como Lido</span>
                </>
              )}
            </button>
          </div>

        </div>

        {/* PRAYER REQUEST CARD */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-[#E5E3DF] dark:border-zinc-800 p-6 sm:p-8 shadow-sm mb-8 space-y-4">
          <h3 className="text-sm font-sans font-black uppercase tracking-widest text-[#B45309] text-center">
            🙏 Pedido de Oração
          </h3>
          <p className="text-center text-stone-500 dark:text-stone-400 text-sm font-serif italic">
            Deixe seu pedido e o pastor irá orar por você.
          </p>
          <button
            onClick={() => setShowPrayerForm(true)}
            className="w-full h-16 px-6 bg-[#4e3629] hover:bg-stone-800 text-white rounded-2xl flex items-center justify-center gap-3 shadow-md transition-all"
          >
            <Heart className="w-6 h-6 text-amber-400" />
            <span className="text-lg font-black">Enviar Pedido de Oração</span>
          </button>

          {isAdmin && (
            <div className="space-y-3 border-t border-stone-100 dark:border-zinc-800 pt-4">
              <button
                onClick={showPrayerRequests ? () => setShowPrayerRequests(false) : handleLoadPrayerRequests}
                disabled={isLoadingPrayers}
                className="w-full py-2.5 px-4 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-black uppercase tracking-wide text-amber-800 dark:text-amber-300 flex items-center justify-center gap-2 transition disabled:opacity-40"
              >
                {isLoadingPrayers ? (
                  <div className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Heart className="w-3.5 h-3.5" />
                )}
                {showPrayerRequests ? 'Ocultar Pedidos' : 'Ver Pedidos Recebidos'}
              </button>

              <AnimatePresence>
                {showPrayerRequests && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    {prayerRequests.length === 0 ? (
                      <p className="text-center text-stone-400 text-xs italic py-4">Nenhum pedido recebido ainda.</p>
                    ) : (
                      prayerRequests.map(req => (
                        <div key={req.id} className="bg-stone-50 dark:bg-zinc-800 rounded-xl p-4 border border-stone-200 dark:border-zinc-700 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-amber-700 dark:text-amber-400">{req.name}</span>
                            <span className="text-[10px] text-stone-400">
                              {new Date(req.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm font-serif text-stone-700 dark:text-stone-200 leading-relaxed">{req.request}</p>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* SECONDARY BLOCKS (PROGRESS, CALENDAR, REMINDERS - LOWER PORTION BENTO GRIDS AS REQUESTED) */}
        <hr className="border-[#E5E3DF] dark:border-zinc-800 my-4" />

        <div className="text-stone-400 text-xs font-bold uppercase tracking-widest text-center mb-6">
          📈 Seu Progresso e Ferramentas Diárias
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          
          {/* BENTO BLOCK A: ANNUAL PROGRESS OF READ DEVOTIONALS */}
          <div className="bg-white dark:bg-zinc-910 p-6 rounded-2xl border border-stone-200/60 dark:border-zinc-800 space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-widest text-stone-500 font-sans flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-amber-700" />
              Progresso do Ano
            </h4>
            
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold text-stone-400">Dias Lidos</span>
                <span className="text-xl font-serif italic text-stone-600 font-bold">{totalReadCount}/365</span>
              </div>
              <div className="h-4.5 w-full bg-stone-100 dark:bg-zinc-800 rounded-full overflow-hidden border border-[#E5E3DF]/50 p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-500 shadow-inner rounded-full transition-all duration-300 pointer-events-none" 
                  style={{ width: `${Math.max(4, progressPercent)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-stone-400 font-mono">
                <span>{progressPercent}% concluído</span>
                <button
                  onClick={handleResetProgress}
                  className="text-red-650 dark:text-red-400 hover:underline font-bold"
                >
                  Resetar Estudos
                </button>
              </div>

              {/* CLOUD SYNC STATUS: keeps "Marcar como Lido" the same across devices */}
              {currentUser ? (
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 font-bold pt-1">
                  {isSyncingProgress ? (
                    <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>Progresso salvo na nuvem ({currentUser.email})</span>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="w-full flex items-center justify-center gap-1.5 text-[10px] text-stone-500 dark:text-stone-400 font-bold pt-1 hover:text-amber-700 dark:hover:text-amber-400 disabled:opacity-50"
                >
                  <CloudOff className="w-3.5 h-3.5 shrink-0" />
                  <span>{isLoggingIn ? 'Entrando...' : 'Entrar com Google para salvar seu progresso em todos os aparelhos'}</span>
                </button>
              )}
            </div>

            <button
              id="calendar_panel_trigger"
              onClick={() => setIsCalendarOpen(t => !t)}
              className="w-full min-h-[46px] py-2 px-3 text-sm bg-stone-100 dark:bg-zinc-800 hover:bg-amber-100 dark:hover:bg-amber-950 text-stone-800 dark:text-amber-200 rounded-xl font-bold border border-transparent hover:border-amber-500/30 flex items-center justify-center gap-2 transition select-none"
            >
              <Calendar className="w-4 h-4 text-amber-700" />
              {isCalendarOpen ? 'Ocultar Calendário Geral' : 'Exibir Calendário de 365 Dias'}
            </button>

            {/* COLLAPSIBLE CALENDAR COMPONENT FOR 365 DAYS SELECTION (RENDERED LOGICALLY UNDER THE BUTTON AS DIRECTLY REQUESTED) */}
            <AnimatePresence>
              {isCalendarOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-stone-50 dark:bg-zinc-900 rounded-xl border border-[#E5E3DF]/60 p-3 space-y-3 overflow-hidden"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Escolha uma data:</span>
                    <button
                      onClick={() => setIsCalendarOpen(false)}
                      className="text-[10px] text-stone-500 hover:underline font-bold"
                    >
                      Fechar [✕]
                    </button>
                  </div>

                  {/* Legenda */}
                  <div className="flex items-center gap-3 text-[9px] text-stone-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-200 ring-1 ring-amber-500 inline-block" />Selecionado</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 dark:bg-amber-900 inline-block" />Hoje</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 inline-block" />Lido</span>
                  </div>

                  {/* Calendário agrupado por mês */}
                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-0.5 select-none">
                    {Array.from({ length: 12 }, (_, monthIdx) => {
                      const year = new Date().getFullYear();
                      const daysInMonth: { dayOfYear: number; dayNum: number }[] = [];
                      const cursor = new Date(year, monthIdx, 1);
                      while (cursor.getMonth() === monthIdx) {
                        const dayOfYear = getDayOfYear(new Date(cursor));
                        if (dayOfYear <= 365) {
                          daysInMonth.push({ dayOfYear, dayNum: cursor.getDate() });
                        }
                        cursor.setDate(cursor.getDate() + 1);
                      }
                      const monthName = new Date(year, monthIdx, 1)
                        .toLocaleDateString('pt-BR', { month: 'long' });

                      return (
                        <div key={monthIdx}>
                          <div className="text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-zinc-900 px-2 py-1 rounded mb-1 sticky top-0 z-10">
                            {monthName}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {daysInMonth.map(({ dayOfYear, dayNum }) => {
                              const isDayRead = userSettings.readDays.includes(dayOfYear);
                              const isDayStarred = userSettings.starredDays.includes(dayOfYear);
                              const isCurrent = dayOfYear === selectedDay;
                              const isToday = dayOfYear === currentDayNum;

                              return (
                                <button
                                  key={dayOfYear}
                                  onClick={() => setSelectedDay(dayOfYear)}
                                  title={`${dayNum} de ${monthName}`}
                                  className={`text-xs py-1.5 rounded font-bold transition-all leading-none ${
                                    isCurrent
                                      ? 'ring-2 ring-amber-500 bg-amber-200 text-amber-950 scale-105'
                                      : isToday
                                      ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-black'
                                      : isDayRead
                                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-950 dark:text-emerald-200'
                                      : 'bg-stone-50 dark:bg-zinc-800 text-stone-600 dark:text-stone-400 border border-stone-200/40'
                                  }`}
                                >
                                  {dayNum}
                                  {isDayStarred && <span className="text-[6px] text-amber-500 block leading-none">★</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* PHONE INSTALL DEVICE SUPPORT (ADDITIONAL SCREEN LINK) */}
        <div className="bg-stone-50 dark:bg-[#121212] rounded-2xl border border-[#E5E3DF] dark:border-zinc-850 p-5 space-y-3 mb-10">
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-8 h-8 text-amber-600" />
              <div className="text-left">
                <h4 className="font-bold text-sm">Disponível no seu Celular!</h4>
                <p className="text-xs text-stone-400 leading-normal">Instale o app e acesse de forma offline a qualquer momento da manhã.</p>
              </div>
            </div>
            <button
              onClick={() => setShowInstallHelp(h => !h)}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-bold transition self-stretch sm:self-auto"
            >
              {showInstallHelp ? 'Fechar Ajuda' : 'Ver Como Instalar'}
            </button>
          </div>

          {showInstallHelp && (
            <div className="p-4 bg-white dark:bg-zinc-900 border text-xs leading-relaxed space-y-2 rounded-xl text-stone-600 dark:text-stone-300">
              <p className="font-bold text-amber-700">Como adicionar no celular:</p>
              <p>📱 <strong>No iPhone (Safari):</strong> Toque no ícone Compartilhar <Share2 className="w-3 h-3 inline" /> e selecione <strong>Adicionar à Tela de Início</strong>.</p>
              <p>🤖 <strong>No Android (Chrome):</strong> Toque no menu de três pontos e selecione <strong>Adicionar à Tela Principal</strong> ou <strong>Instalar</strong>.</p>
            </div>
          )}
        </div>

      </main>

      {/* PRAYER REQUEST FORM MODAL */}
      <AnimatePresence>
        {showPrayerForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSendingPrayer && setShowPrayerForm(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl space-y-5 z-10"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-serif font-black text-[#4e3629] dark:text-amber-100 flex items-center gap-2">
                  <Heart className="w-5 h-5 text-amber-600" />
                  Pedido de Oração
                </h3>
                {!prayerSent && (
                  <button onClick={() => setShowPrayerForm(false)} className="text-stone-400 hover:text-stone-600 p-1">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {prayerSent ? (
                <div className="text-center py-8 space-y-3">
                  <div className="text-5xl">🙏</div>
                  <p className="text-lg font-serif font-bold text-emerald-700 dark:text-emerald-400">Pedido enviado!</p>
                  <p className="text-sm text-stone-500 dark:text-stone-400 font-serif italic">O pastor receberá seu pedido e orará por você.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Seu nome (opcional)</label>
                    <input
                      type="text"
                      value={prayerName}
                      onChange={e => setPrayerName(e.target.value)}
                      placeholder="Pode deixar em branco se preferir"
                      className="w-full p-3 border rounded-xl text-base bg-stone-50 dark:bg-zinc-800 border-[#E5E3DF] dark:border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">Pedido de Oração *</label>
                    <textarea
                      rows={4}
                      value={prayerText}
                      onChange={e => setPrayerText(e.target.value)}
                      placeholder="Escreva aqui o seu pedido..."
                      className="w-full p-3 border rounded-xl text-base font-serif bg-stone-50 dark:bg-zinc-800 border-[#E5E3DF] dark:border-zinc-700 resize-none"
                    />
                  </div>
                  <button
                    onClick={handleSendPrayerRequest}
                    disabled={!prayerText.trim() || isSendingPrayer}
                    className="w-full h-14 bg-[#4e3629] hover:bg-stone-800 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 transition disabled:opacity-40"
                  >
                    {isSendingPrayer ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Heart className="w-5 h-5 text-amber-400" />
                        Enviar Pedido
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-stone-400 text-center">Seu pedido será visto apenas pelo pastor.</p>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ACCESS DRAWER PANEL FOR GENERAL ACCESSIBILITY SETTINGS */}
      <AnimatePresence>
        {showSettingsDrawer && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            
            {/* Backdrop cover with slide block */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettingsDrawer(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 text-stone-900 dark:text-white h-full shadow-2xl flex flex-col z-10"
            >
              {/* Settings header */}
              <div className="p-5 border-b border-[#E5E3DF] bg-[#4e3629] text-white flex justify-between items-center">
                <h3 className="font-serif font-black text-xl flex items-center gap-2">
                  <Settings className="w-6 h-6 text-amber-400" />
                  Letra e Narração
                </h3>
                <button
                  onClick={() => setShowSettingsDrawer(false)}
                  className="text-stone-300 hover:text-white font-extrabold p-2 text-lg min-h-[44px]"
                  title="Fechar configurações"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable controls list */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Contrast styles settings panel */}
                <div>
                  <h4 className="font-bold text-stone-850 dark:text-stone-300 text-sm mb-3 border-l-2 border-amber-500 pl-2 uppercase tracking-wide font-mono">
                    Contraste e Estilo Visual
                  </h4>
                  <div className="space-y-2">
                    {[
                      { id: 'standard', label: '☕ Café Cappuccino (Acolhedor)' },
                      { id: 'high-contrast-light', label: '☀ Alto Contraste Claro' },
                      { id: 'high-contrast-dark', label: '🌙 Alto Contraste Escuro' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setAccessibility(prev => ({ ...prev, contrast: opt.id as any }))}
                        className={`w-full min-h-[50px] p-3 text-left font-bold rounded-xl border-2 transition text-sm ${accessibility.contrast === opt.id ? 'border-amber-500 bg-amber-50 text-amber-950 font-black' : 'border-stone-200 dark:border-zinc-800 hover:bg-stone-50'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Elder-friendly typography styles config */}
                <div>
                  <h4 className="font-bold text-stone-850 dark:text-stone-300 text-sm mb-3 border-l-2 border-amber-500 pl-2 uppercase tracking-wide font-mono">
                    Tamanho da Letra (Idoso Fácil)
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'normal', label: 'Médio', text: 'Aa' },
                      { id: 'large', label: 'Grande', text: 'A+' },
                      { id: 'extra-large', label: 'Muito G.', text: 'A++' }
                    ].map((sz) => (
                      <button
                        key={sz.id}
                        onClick={() => {
                          setAccessibility(prev => ({ ...prev, fontSize: sz.id as any }));
                        }}
                        className={`p-3 border-2 rounded-xl flex flex-col items-center justify-center min-h-[64px] transition ${accessibility.fontSize === sz.id ? 'border-amber-500 bg-amber-50 text-amber-950 font-black' : 'border-stone-200 dark:border-zinc-800 hover:bg-stone-50'}`}
                      >
                        <span className="text-xl font-extrabold">{sz.text}</span>
                        <span className="text-xs uppercase">{sz.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Font Family choices */}
                <div>
                  <h4 className="font-bold text-stone-850 dark:text-stone-300 text-sm mb-3 border-l-2 border-amber-500 pl-2 uppercase tracking-wide font-mono">
                    Estilo de Fonte (Leitura)
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setAccessibility(prev => ({ ...prev, fontFamily: 'serif' }))}
                      className={`p-3 border-2 rounded-xl flex flex-col items-center justify-center min-h-[60px] transition font-serif ${accessibility.fontFamily === 'serif' ? 'border-amber-500 bg-amber-50 text-amber-950 font-extrabold' : 'border-stone-200 dark:border-zinc-800 hover:bg-stone-50'}`}
                    >
                      <span className="text-sm font-serif">Serifada Elegante</span>
                      <span className="text-[10px] font-sans">Ideal para reflexões</span>
                    </button>
                    <button
                      onClick={() => setAccessibility(prev => ({ ...prev, fontFamily: 'sans' }))}
                      className={`p-3 border-2 rounded-xl flex flex-col items-center justify-center min-h-[60px] transition font-sans ${accessibility.fontFamily === 'sans' ? 'border-amber-500 bg-amber-50 text-amber-950 font-extrabold' : 'border-stone-200 dark:border-zinc-800 hover:bg-stone-50'}`}
                    >
                      <span className="text-sm font-sans">Moderna Plana</span>
                      <span className="text-[10px] font-sans">Ideal para botões</span>
                    </button>
                  </div>
                </div>

                {/* 4. Audio playback speed config for elderly */}
                <div>
                  <h4 className="font-bold text-stone-850 dark:text-stone-300 text-sm mb-3 border-l-2 border-amber-500 pl-2 uppercase tracking-wide font-mono">
                    Velocidade da Voz
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 0.7, label: 'Lenta' },
                      { id: 0.9, label: 'Suave' },
                      { id: 1.0, label: 'Normal' },
                      { id: 1.2, label: 'Rápida' }
                    ].map((sp) => (
                      <button
                        key={sp.id}
                        onClick={() => setAccessibility(prev => ({ ...prev, audioSpeed: sp.id }))}
                        className={`p-2 border rounded-xl flex flex-col items-center justify-center text-xs transition ${accessibility.audioSpeed === sp.id ? 'border-amber-500 bg-amber-50 text-amber-950 font-extrabold' : 'border-stone-200 dark:border-zinc-800 hover:bg-stone-50'}`}
                      >
                        <span className="font-bold">{sp.id}x</span>
                        <span className="text-[10px] opacity-80">{sp.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Bottom footer drawer action */}
              <div className="p-5 border-t border-stone-200 bg-stone-50 dark:bg-zinc-950">
                <button
                  onClick={() => setShowSettingsDrawer(false)}
                  className="w-full min-h-[50px] bg-[#4e3629] text-white hover:bg-stone-800 font-extrabold text-sm rounded-xl py-3 tracking-wider uppercase transition shadow"
                >
                  Confirmar Ajustes
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
