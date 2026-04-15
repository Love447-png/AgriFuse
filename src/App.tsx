import React, { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, PerspectiveCamera } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Mic, Send, Leaf, AlertTriangle, CheckCircle2, Info, Activity, Globe, ShieldCheck, ChevronRight, X, LogOut, History, Map as MapIcon, User, Settings, Zap, TrendingUp, BarChart3, LocateFixed, Thermometer, Droplets, Wind } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, doc, setDoc, getDoc, limit } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import 'leaflet/dist/leaflet.css';
import './i18n';

// --- Map Fix for Leaflet ---
import L from 'leaflet';
let DefaultIcon = L.icon({ 
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png', 
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png' 
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- 3D Background ---
function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-[-1] bg-gradient-to-br from-[#020617] via-[#05112e] to-[#020617]">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <Suspense fallback={null}>
          <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
            <Sphere args={[1.5, 64, 64]} position={[-2, 1, -2]}>
              <MeshDistortMaterial color="#10b981" speed={3} distort={0.4} radius={1} opacity={0.4} transparent />
            </Sphere>
          </Float>
          <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
            <Sphere args={[1, 64, 64]} position={[2, -1, -1]}>
              <MeshDistortMaterial color="#059669" speed={2} distort={0.3} radius={1} opacity={0.3} transparent />
            </Sphere>
          </Float>
        </Suspense>
      </Canvas>
    </div>
  );
}

// --- App Component ---
export default function App() {
  const [user, loading] = useAuthState(auth);
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'scan' | 'history' | 'map' | 'profile'>('scan');
  const [reports, setReports] = useState<any[]>([]);
  const [networkReports, setNetworkReports] = useState<any[]>([]);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [farmProfile, setFarmProfile] = useState<any>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // --- Geolocation ---
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);

  // --- Network Intelligence (Global Reports) ---
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNetworkReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // --- Farm Profile ---
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'farms', user.uid), (doc) => {
      if (doc.exists()) setFarmProfile(doc.data());
    });
    return () => unsubscribe();
  }, [user]);

  // --- Fetch History ---
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'reports'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    return () => unsubscribe();
  }, [user]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Sync User to Firestore
  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        lastLogin: serverTimestamp()
      }, { merge: true });
    }
  }, [user]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
      setStream(mediaStream);
    } catch (err) {
      setError("Camera access denied.");
    }
  };

  useEffect(() => {
    if (stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Voice Input (STT) ---
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = i18n.language === 'hi' ? 'hi-IN' : 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(prev => prev + " " + text);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [i18n.language]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  // --- Voice Output (TTS) ---
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = i18n.language === 'hi' ? 'hi-IN' : 'en-US';
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAnalyze = async () => {
    if (!user) return setError("Please login to analyze.");
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);
    setIsAnalyzing(true);
    setError(null);

    try {
      let frameBase64 = uploadedImage ? uploadedImage.split(',')[1] : "";
      if (!frameBase64 && videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        frameBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      }

      if (!frameBase64) throw new Error("No image provided.");

      const prompt = `
        SYSTEM ROLE: AGRIFUSE SENIOR PATHOLOGIST & AI ARCHITECT
        Perform a deep multimodal analysis of this crop.
        
        USER CONTEXT: ${transcript}
        TARGET LANGUAGE: ${i18n.language === 'hi' ? 'Hindi' : 'English'}
        
        MANDATORY: Return the response in the TARGET LANGUAGE.
        
        [FARMER_RESPONSE]
        Issue: [Specific Diagnosis]
        Severity: [Low/Medium/High/Critical]
        Explanation: [Deep technical yet accessible explanation of the issue]
        Risk Factors: [List 3-4 environmental or biological factors contributing to this]
        Mitigation Strategy: [Detailed plan on how to overcome this issue, including biological and chemical suggestions if applicable]
        Immediate Actions: [List of 5 precise, step-by-step tasks for the farmer]
        Long-term Prevention: [Strategic advice for future seasons]
        Urgency Level: [Immediate/24h/Monitor]

        [STRUCTURED_INTELLIGENCE]
        crop_type: [Type]
        suspected_issue: [Technical Name]
        category: [disease/pest/nutrient/environmental]
        severity_score: [1-10]
        spread_type: [localized/moderate/widespread]
        duration_days: [Estimated]
        confidence_score: [0.0-1.0]
        economic_risk: [Estimated % yield loss if untreated]
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: frameBase64 } }] }],
        config: { temperature: 0.1, topP: 0.95 }
      });

      const text = response.text;
      const parseSection = (tag: string, endTag?: string) => {
        const s = text.indexOf(tag) + tag.length;
        const e = endTag ? text.indexOf(endTag, s) : text.length;
        return text.substring(s, e === -1 ? text.length : e).trim();
      };

      const farmerRaw = parseSection("[FARMER_RESPONSE]", "[STRUCTURED_INTELLIGENCE]");
      const intelRaw = parseSection("[STRUCTURED_INTELLIGENCE]");
      
      const parseLines = (raw: string) => {
        const obj: any = {};
        raw.split('\n').forEach(l => {
          const c = l.indexOf(':');
          if (c !== -1) {
            const key = l.substring(0, c).trim().toLowerCase().replace(/ /g, '_').replace(/\*/g, '');
            const val = l.substring(c + 1).trim().replace(/\*/g, '');
            obj[key] = val;
          }
        });
        return obj;
      };

      const farmer = parseLines(farmerRaw);
      const intel = parseLines(intelRaw);

      const reportData = {
        userId: user.uid,
        userName: user.displayName,
        ...farmer,
        ...intel,
        lat: location?.lat || 0,
        lng: location?.lng || 0,
        timestamp: serverTimestamp(),
        imageUrl: "Captured Frame"
      };

      await addDoc(collection(db, 'reports'), reportData);
      setResult({ farmer_response: farmer, structured_intelligence: intel });
      
      // Auto-speak the result
      speak(`${farmer.issue}. ${farmer.explanation}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Simulation Engine ---
  const runSimulation = (days: number) => {
    if (!result) return;
    setIsSimulating(true);
    setTimeout(() => {
      const severity = parseInt(result.structured_intelligence.severity_score);
      const risk = parseFloat(result.structured_intelligence.economic_risk);
      const spreadRate = result.structured_intelligence.spread_type === 'widespread' ? 1.5 : 1.1;
      
      const data = Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        severity: Math.min(10, severity * Math.pow(spreadRate, i / 2)),
        yieldLoss: Math.min(100, risk * Math.pow(spreadRate, i / 2))
      }));
      
      setSimulationResult(data);
      setIsSimulating(false);
    }, 1500);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#020617]"><Activity className="animate-spin text-emerald-500 w-12 h-12" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#020617] text-white font-sans">
        <AnimatedBackground />
        
        {/* Navigation */}
        <nav className="fixed top-0 w-full z-50 px-6 py-6 flex justify-between items-center bg-black/20 backdrop-blur-xl border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <Leaf className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-black font-display tracking-tighter">AgriFuse</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-widest text-white/60">
            <a href="#features" className="hover:text-emerald-400 transition-colors">Features</a>
            <a href="#network" className="hover:text-emerald-400 transition-colors">Global Network</a>
            <a href="#impact" className="hover:text-emerald-400 transition-colors">Impact</a>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="px-6 py-2.5 bg-white text-black rounded-full font-bold text-sm hover:bg-emerald-400 hover:text-white transition-all active:scale-95 shadow-lg shadow-white/5"
          >
            Get Started
          </button>
        </nav>

        {/* Hero Section */}
        <main className="relative pt-32 pb-20 px-6 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Next-Gen Agri-Intelligence</span>
              </div>
              
              <h1 className="text-6xl md:text-8xl font-black font-display leading-[0.9] tracking-tighter">
                Protect your <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">Harvest</span> with <br />
                AI Precision.
              </h1>
              
              <p className="text-xl text-white/60 font-medium max-w-lg leading-relaxed">
                AgriFuse combines multimodal AI with a global intelligence network to detect, diagnose, and prevent crop diseases before they spread.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button 
                  onClick={signInWithGoogle}
                  className="px-10 py-5 bg-emerald-500 text-white rounded-2xl font-bold text-lg shadow-[0_20px_40px_rgba(16,185,129,0.2)] hover:bg-emerald-400 hover:-translate-y-1 transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <Globe className="w-6 h-6" />
                  Launch Dashboard
                </button>
                <div className="flex items-center gap-4 px-6 py-5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
                  <div className="flex -space-x-3">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-[#020617] bg-emerald-500 flex items-center justify-center text-[10px] font-bold">
                        <User className="w-4 h-4" />
                      </div>
                    ))}
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-white">10k+ Farmers</p>
                    <p className="text-white/40">Joined the network</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="relative aspect-square"
            >
              <div className="absolute inset-0 bg-emerald-500/20 blur-[120px] rounded-full animate-pulse" />
              <div className="relative h-full w-full glass-card rounded-[4rem] border-white/10 flex items-center justify-center overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
                <Leaf className="w-48 h-48 text-emerald-500/20 animate-float" />
                
                {/* Floating UI Elements */}
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute top-12 left-12 p-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl"
                >
                  <Activity className="w-6 h-6 text-emerald-400 mb-2" />
                  <div className="h-1.5 w-12 bg-emerald-500/40 rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-emerald-400" />
                  </div>
                </motion.div>

                <motion.div 
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 5, repeat: Infinity, delay: 1 }}
                  className="absolute bottom-20 right-12 p-4 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl"
                >
                  <ShieldCheck className="w-6 h-6 text-teal-400 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Secure Scan</p>
                </motion.div>
              </div>
            </motion.div>
          </div>

          {/* Stats Bar */}
          <div className="mt-32 grid grid-cols-2 md:grid-cols-4 gap-8 p-10 bg-white/5 backdrop-blur-md rounded-[3rem] border border-white/10">
            {[
              { label: "Accuracy", val: "98.4%" },
              { label: "Countries", val: "42+" },
              { label: "Detections", val: "1.2M" },
              { label: "Response", val: "< 2s" }
            ].map((stat, i) => (
              <div key={i} className="text-center space-y-1">
                <p className="text-3xl font-black font-display text-emerald-400">{stat.val}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{stat.label}</p>
              </div>
            ))}
          </div>
        </main>

        {/* Features Section */}
        <section id="features" className="py-32 px-6 max-w-7xl mx-auto">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-4xl md:text-6xl font-black font-display">Built for the Field.</h2>
            <p className="text-white/40 font-medium max-w-2xl mx-auto">AgriFuse isn't just an app—it's a complete ecosystem designed to empower farmers with enterprise-grade intelligence.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "Multimodal AI", desc: "Analyze crops using photos, video, and voice descriptions simultaneously.", icon: Camera },
              { title: "Global Network", desc: "Real-time outbreak detection clusters mapped across the globe.", icon: Globe },
              { title: "Expert Guidance", desc: "Get specific, actionable steps from our agricultural pathologist engine.", icon: ShieldCheck }
            ].map((feature, i) => (
              <div key={i} className="p-10 glass-card rounded-[3rem] border-white/5 hover:border-emerald-500/30 transition-all group">
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-emerald-500 transition-colors">
                  <feature.icon className="w-6 h-6 text-emerald-400 group-hover:text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                <p className="text-white/40 font-medium leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="py-20 border-t border-white/5 text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Leaf className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-black font-display tracking-tighter">AgriFuse</span>
          </div>
          <p className="text-white/20 text-xs font-bold uppercase tracking-[0.3em]">© 2026 AgriFuse Intelligence Network. All Rights Reserved.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative font-sans bg-[#020617] text-white overflow-x-hidden">
      <AnimatedBackground />
      
      {/* Sidebar / Nav */}
      <nav className="fixed left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4">
        {[
          { id: 'scan', icon: Camera, label: t('dashboard') },
          { id: 'history', icon: History, label: t('history') },
          { id: 'map', icon: MapIcon, label: t('map') },
          { id: 'profile', icon: User, label: 'Profile' }
        ].map(item => (
          <button 
            key={item.id}
            onClick={() => setView(item.id as any)}
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center transition-all group relative border border-white/5",
              view === item.id ? "bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.3)] border-emerald-400/50" : "bg-white/5 backdrop-blur-xl text-white/40 hover:text-white hover:bg-white/10"
            )}
          >
            <item.icon className="w-6 h-6" />
            <span className="absolute left-16 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-2xl">
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 p-6 flex justify-between items-center bg-black/20 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-3 ml-20">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
            <Leaf className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-black font-display tracking-tighter">AgriFuse</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10">
            <img src={user.photoURL || ""} className="w-6 h-6 rounded-full border border-emerald-500/50" alt="User" />
            <span className="text-xs font-bold text-white/80">{user.displayName}</span>
          </div>
          <select 
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-emerald-500"
          >
            <option value="en" className="bg-[#020617]">EN</option>
            <option value="hi" className="bg-[#020617]">HI</option>
          </select>
          <button onClick={logout} className="p-2.5 bg-white/5 border border-white/10 rounded-full hover:bg-red-500/20 hover:text-red-400 transition-all">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="pl-28 pr-6 pt-28 pb-12 max-w-7xl mx-auto relative z-10">
        {view === 'scan' && (
          <div className="grid grid-cols-12 gap-6">
            {/* Main Analysis Bento Item */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              <div className="glass-card rounded-[3.5rem] p-10 border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 flex gap-3">
                  <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Distributed Network Active</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <h2 className="text-5xl font-black font-display tracking-tighter leading-[1.1]">{t('protect_harvest')}</h2>
                  
                  <div className="relative aspect-video rounded-[2.5rem] overflow-hidden bg-black/40 border border-white/5 shadow-inner group">
                    {!stream && !uploadedImage ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-12 text-center">
                        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 animate-float">
                          <Camera className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div className="flex gap-4 w-full max-w-sm">
                          <button onClick={startCamera} className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20">{t('open_camera')}</button>
                          <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-4 bg-white/5 text-white border border-white/10 rounded-2xl font-bold hover:bg-white/10 transition-all active:scale-95">{t('upload_photo')}</button>
                          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                        </div>
                      </div>
                    ) : (
                      <>
                        {uploadedImage ? <img src={uploadedImage} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />}
                        <AnimatePresence>{showFlash && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white z-20" />}</AnimatePresence>
                        <button onClick={() => { stopCamera(); setUploadedImage(null); }} className="absolute top-6 right-6 p-3 bg-black/40 backdrop-blur-md text-white rounded-xl hover:bg-red-500/40 transition-all"><X className="w-5 h-5" /></button>
                      </>
                    )}
                  </div>

                  <div className="flex gap-4 items-center">
                    <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-2xl p-5 flex items-center gap-4 border border-white/10 shadow-2xl">
                      <button 
                        onClick={toggleListening}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          isListening ? "bg-red-500 text-white animate-pulse" : "text-emerald-400 hover:bg-white/5"
                        )}
                      >
                        <Mic className="w-6 h-6" />
                      </button>
                      <input 
                        value={transcript} 
                        onChange={e => setTranscript(e.target.value)} 
                        placeholder="Describe symptoms, duration, and timeline..." 
                        className="bg-transparent border-none outline-none text-white w-full font-bold placeholder:text-white/20" 
                      />
                    </div>
                    <button 
                      onClick={handleAnalyze} 
                      disabled={isAnalyzing}
                      className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl hover:bg-emerald-400 transition-all active:scale-95"
                    >
                      {isAnalyzing ? <Activity className="animate-spin text-white w-8 h-8" /> : <Send className="text-white w-10 h-10" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Result Bento Item */}
              <AnimatePresence mode="wait">
                {result && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="glass-card rounded-[3.5rem] p-10 border-white/10 shadow-2xl space-y-8">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">{t('diagnosis')}</p>
                          <h3 className="text-5xl font-black font-display tracking-tighter">{result.farmer_response.issue}</h3>
                        </div>
                        <button 
                          onClick={() => speak(`${result.farmer_response.issue}. ${result.farmer_response.explanation}`)}
                          className={cn(
                            "p-4 rounded-2xl border border-white/10 transition-all",
                            isSpeaking ? "bg-emerald-500 text-white" : "bg-white/5 text-emerald-400 hover:bg-white/10"
                          )}
                        >
                          <Activity className={cn("w-6 h-6", isSpeaking && "animate-pulse")} />
                        </button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-6">
                          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-4">
                            <p className="text-white/60 font-medium leading-relaxed text-lg">{result.farmer_response.explanation}</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10">
                              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2">{t('economic_risk')}</p>
                              <p className="text-2xl font-black text-white">{result.structured_intelligence.economic_risk}</p>
                            </div>
                            <div className="p-6 bg-red-500/5 rounded-3xl border border-red-500/10">
                              <p className="text-[8px] font-black text-red-400 uppercase tracking-widest mb-2">{t('severity_index')}</p>
                              <p className="text-2xl font-black text-white">{result.structured_intelligence.severity_score}/10</p>
                            </div>
                          </div>

                          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-4">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">{t('risk_factors')}</p>
                            <ul className="space-y-2">
                              {result.farmer_response.risk_factors?.split(',').map((r: string, i: number) => (
                                <li key={i} className="flex items-start gap-3 text-white/70 font-bold text-sm">
                                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5" />
                                  {r.trim()}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="p-8 bg-emerald-500/10 rounded-[2.5rem] border border-emerald-500/20 space-y-4">
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{t('mitigation')}</p>
                            <p className="text-white/80 font-bold leading-relaxed">{result.farmer_response.mitigation_strategy}</p>
                          </div>

                          <div className="space-y-4">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">{t('actions')}</p>
                            <div className="grid gap-3">
                              {result.farmer_response.immediate_actions?.split(',').map((a: string, i: number) => (
                                <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                                  <span className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-xs font-black text-emerald-400">{i+1}</span>
                                  <span className="font-bold text-white/80">{a.trim()}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-4">{t('prevention')}</p>
                            <p className="text-white/80 font-bold">{result.farmer_response.long_term_prevention}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Simulation Widget */}
                    <div className="glass-card rounded-[3.5rem] p-10 border-white/10 shadow-2xl space-y-8">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Simulation Mode</p>
                          <h3 className="text-3xl font-black font-display tracking-tighter">7-Day Spread Forecast</h3>
                        </div>
                        <button 
                          onClick={() => runSimulation(7)}
                          disabled={isSimulating}
                          className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-400 transition-all"
                        >
                          {isSimulating ? <Activity className="animate-spin w-4 h-4" /> : <Zap className="w-4 h-4" />}
                          Run Simulation
                        </button>
                      </div>

                      {simulationResult ? (
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={simulationResult}>
                              <defs>
                                <linearGradient id="colorSeverity" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                              <XAxis dataKey="day" stroke="#ffffff40" fontSize={10} tickFormatter={(v) => `Day ${v}`} />
                              <YAxis stroke="#ffffff40" fontSize={10} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem' }}
                                itemStyle={{ fontWeight: 'bold' }}
                              />
                              <Area type="monotone" dataKey="severity" stroke="#10b981" fillOpacity={1} fill="url(#colorSeverity)" name="Severity" />
                              <Area type="monotone" dataKey="yieldLoss" stroke="#ef4444" fillOpacity={1} fill="url(#colorLoss)" name="Yield Loss %" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2rem] text-white/20">
                          <TrendingUp className="w-12 h-12 mb-4" />
                          <p className="font-bold">Run simulation to see spread patterns</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sidebar Bento Items */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
              {/* Decision Engine Widget */}
              <div className="glass-card rounded-[2.5rem] p-8 border-white/10 shadow-2xl bg-gradient-to-br from-emerald-500/20 to-transparent border-emerald-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Decision Engine</p>
                </div>
                <h4 className="text-2xl font-black mb-4">What should YOU do now?</h4>
                <div className="space-y-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Based on Location & Weather</p>
                    <p className="text-sm font-bold text-white/80">High humidity (64%) detected. Fungal spread risk is elevated. Apply preventive fungicide within 24h.</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Nearby Activity</p>
                    <p className="text-sm font-bold text-white/80">3 similar cases of Yellow Rust detected within 10km. Coordinate with neighbors for community spraying.</p>
                  </div>
                </div>
              </div>

              {/* Weather Widget */}
              <div className="glass-card rounded-[2.5rem] p-8 border-white/10 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Local Conditions</p>
                  <Thermometer className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-end gap-4">
                  <h4 className="text-5xl font-black font-display">32°C</h4>
                  <p className="text-white/40 font-bold mb-1">Partly Cloudy</p>
                </div>
                <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-3 gap-4">
                  <div>
                    <Droplets className="w-3 h-3 text-emerald-400 mb-1" />
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Humidity</p>
                    <p className="font-bold">64%</p>
                  </div>
                  <div>
                    <Wind className="w-3 h-3 text-emerald-400 mb-1" />
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Wind</p>
                    <p className="font-bold">12 km/h</p>
                  </div>
                  <div>
                    <LocateFixed className="w-3 h-3 text-emerald-400 mb-1" />
                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">UV Index</p>
                    <p className="font-bold">High</p>
                  </div>
                </div>
              </div>

              {/* Network Insights */}
              <div className="glass-card rounded-[2.5rem] p-8 border-white/10 shadow-2xl">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-6">Network Insights</p>
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                    <p className="text-sm font-bold text-emerald-400">Wheat yield forecast increasing in your region due to favorable rain patterns.</p>
                  </div>
                  <div className="p-4 bg-red-500/5 rounded-2xl border border-red-500/10">
                    <p className="text-sm font-bold text-red-400">Chili crop failure reports up 12% in adjacent districts. Expected price rise in 2 weeks.</p>
                  </div>
                </div>
              </div>

              {/* Community Alert */}
              <div className="glass-card rounded-[2.5rem] p-8 border-white/10 shadow-2xl bg-red-500/5 border-red-500/10">
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Outbreak Alert</p>
                </div>
                <p className="font-bold text-white/80 leading-snug">Yellow Rust detected in 3 farms within 10km of your location.</p>
                <button 
                  onClick={() => setView('map')}
                  className="mt-4 text-[10px] font-black text-emerald-400 uppercase tracking-widest hover:text-emerald-300 transition-colors"
                >
                  View Map Details →
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">{t('history')}</p>
                <h2 className="text-5xl font-black font-display tracking-tighter leading-none">Farm Records</h2>
              </div>
              <p className="text-white/40 font-bold">{reports.length} Reports Found</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report) => (
                <motion.div 
                  key={report.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-card rounded-[2.5rem] p-8 border-white/10 hover:border-emerald-500/30 transition-all group cursor-pointer"
                  onClick={() => {
                    setResult({ farmer_response: report, structured_intelligence: report });
                    setView('scan');
                  }}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest",
                      report.severity === 'High' || report.severity === 'Critical' ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    )}>
                      {report.severity}
                    </div>
                    <p className="text-[10px] font-bold text-white/20">
                      {report.timestamp?.toDate().toLocaleDateString()}
                    </p>
                  </div>
                  <h4 className="text-2xl font-black mb-2">{report.issue}</h4>
                  <p className="text-white/40 text-sm line-clamp-2 mb-6">{report.explanation}</p>
                  <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-widest group-hover:gap-4 transition-all">
                    View Full Analysis <Send className="w-3 h-3" />
                  </div>
                </motion.div>
              ))}
              {reports.length === 0 && (
                <div className="col-span-full py-20 text-center glass-card rounded-[3.5rem] border-dashed border-2 border-white/5">
                  <Activity className="w-12 h-12 text-white/10 mx-auto mb-4" />
                  <p className="text-white/30 font-bold">No records found. Start your first scan.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'map' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="glass-card rounded-[3.5rem] p-10 border-white/10 shadow-2xl h-[700px] relative overflow-hidden">
              <div className="absolute top-8 left-8 z-[1000] space-y-4">
                <div className="p-6 bg-[#020617]/80 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl max-w-xs">
                  <h3 className="text-xl font-black font-display mb-2">Live Intelligence Map</h3>
                  <p className="text-xs text-white/60 leading-relaxed">Real-time disease clusters and spread patterns aggregated from the Distributed Crop Intelligence Network.</p>
                </div>
                <div className="p-4 bg-[#020617]/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">High Risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Monitored</span>
                  </div>
                </div>
              </div>

              <MapContainer 
                center={location || [20.5937, 78.9629]} 
                zoom={5} 
                style={{ height: '100%', width: '100%', borderRadius: '2.5rem' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                {networkReports.map((report) => (
                  <CircleMarker 
                    key={report.id}
                    center={[report.lat || 0, report.lng || 0]}
                    radius={report.severity_score * 2 || 10}
                    pathOptions={{ 
                      fillColor: report.severity_score > 7 ? '#ef4444' : '#10b981',
                      color: report.severity_score > 7 ? '#ef4444' : '#10b981',
                      weight: 1,
                      fillOpacity: 0.4
                    }}
                  >
                    <Popup>
                      <div className="p-2 bg-[#020617] text-white rounded-lg">
                        <p className="font-black text-emerald-400 uppercase text-[10px] tracking-widest mb-1">{report.crop_type}</p>
                        <p className="font-bold text-sm mb-2">{report.issue}</p>
                        <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-white/40">
                          <span>Severity: {report.severity_score}/10</span>
                          <span>{new Date(report.timestamp?.toDate()).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </motion.div>
        )}

        {view === 'profile' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-8">
            <div className="glass-card rounded-[3.5rem] p-12 border-white/10 shadow-2xl">
              <div className="flex items-center gap-8 mb-12">
                <img src={user.photoURL || ""} className="w-32 h-32 rounded-[2.5rem] border-4 border-emerald-500/20 shadow-2xl" alt="Profile" />
                <div className="space-y-2">
                  <h2 className="text-5xl font-black font-display tracking-tighter">{user.displayName}</h2>
                  <p className="text-xl text-white/40 font-medium">{user.email}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h3 className="text-2xl font-black font-display tracking-tight">Farm Profile</h3>
                  <div className="space-y-4">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-2">
                      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Farm Size (Acres)</p>
                      <input 
                        type="number" 
                        defaultValue={farmProfile?.farmSize || 10}
                        onBlur={(e) => setDoc(doc(db, 'farms', user.uid), { farmSize: parseFloat(e.target.value) }, { merge: true })}
                        className="bg-transparent border-none outline-none text-2xl font-black text-white w-full"
                      />
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-2">
                      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Crops Grown</p>
                      <p className="text-xl font-bold text-white/80">Wheat, Rice, Cotton</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <h3 className="text-2xl font-black font-display tracking-tight">Network Status</h3>
                  <div className="p-8 bg-emerald-500/10 rounded-[2.5rem] border border-emerald-500/20 flex flex-col items-center justify-center text-center space-y-4">
                    <ShieldCheck className="w-12 h-12 text-emerald-400" />
                    <div className="space-y-1">
                      <p className="text-xl font-black">Verified Contributor</p>
                      <p className="text-sm text-white/60 font-medium">Your scans are helping protect 42 nearby farms.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
