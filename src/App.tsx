/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Trash2, Edit2, FileText, HardDrive, Plus, X, LogIn, LogOut, Search, ImageIcon, FileCode, Film, File as DefaultFileIcon, FileType, ChevronDown, RefreshCw, LayoutGrid, Menu, List, ArrowDownAZ, ArrowUpZA, SortAsc, SortDesc, Calendar, Type, Globe, ArrowLeft, ArrowRight, RotateCw, Home, Star, Copy, ExternalLink, Terminal, Cpu, Settings, Music, Camera, Sparkles } from 'lucide-react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider, db, storage } from './firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import logo from './assets/images/dimension_cloud_3d_logo_transparent_1779743683016.png';
import { FileDetail, StorageInfo } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import CamScanSimulator from './components/CamScanSimulator';

export default function App() {
  const truncateFileName = (name: string, maxLen = 25): string => {
    if (name.length <= maxLen) return name;
    const extIndex = name.lastIndexOf('.');
    if (extIndex !== -1 && name.length - extIndex < 8) {
      const ext = name.substring(extIndex);
      const baseMaxLen = maxLen - ext.length - 3;
      if (baseMaxLen > 0) {
        return name.substring(0, baseMaxLen) + '...' + ext;
      }
    }
    return name.substring(0, maxLen - 3) + '...';
  };

  const [files, setFiles] = useState<FileDetail[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<string | null>(null);
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem('isGuest') === 'true');

  useEffect(() => {
    localStorage.setItem('isGuest', isGuest.toString());
  }, [isGuest]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'icon' | 'list' | 'detail'>('detail');
  const [viewSize, setViewSize] = useState<'large' | 'medium' | 'small'>('medium');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedContent, setEditedContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot' | null>(null);
  const [googleAuthError, setGoogleAuthError] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isDownloadingRemote, setIsDownloadingRemote] = useState(false);
  const [remoteDownloadProgress, setRemoteDownloadProgress] = useState<number | null>(null);
  const [remoteDownloadSpeed, setRemoteDownloadSpeed] = useState<string | null>(null);
  const [remoteDownloadLoaded, setRemoteDownloadLoaded] = useState<number>(0);
  const [remoteDownloadTotal, setRemoteDownloadTotal] = useState<number>(0);
  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [useJsProxy, setUseJsProxy] = useState<boolean>(true);
  const [proxyJsCode, setProxyJsCode] = useState<string>(
    "console.log('[Java Proxy] Custom Script Executing!');\n" +
    "// Contoh: Mengubah warna background halaman\n" +
    "// document.body.style.backgroundColor = '#f0f9ff';"
  );
  const [proxyUserAgent, setProxyUserAgent] = useState<string>(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );
  const [isProxySettingsOpen, setIsProxySettingsOpen] = useState<boolean>(false);

  // States for CamScan Document Scanner Tool
  const [isCamScanOpen, setIsCamScanOpen] = useState(false);
  const [autoScanRequest, setAutoScanRequest] = useState(false);
  const [camScanStream, setCamScanStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // base64 of original captured/imported image
  const [isRearCamera, setIsRearCamera] = useState(true);
  const [scannedCorners, setScannedCorners] = useState<Array<{x: number, y: number}>>([
    {x: 10, y: 15},
    {x: 90, y: 15},
    {x: 90, y: 85},
    {x: 10, y: 85}
  ]);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const [isWarped, setIsWarped] = useState(false);
  const [warpedImage, setWarpedImage] = useState<string | null>(null); // base64 warped
  const [processedImage, setProcessedImage] = useState<string | null>(null); // base64 of filtered/edited visual image
  
  // Custom CamScan Filter & Correction states
  const [scanRotation, setScanRotation] = useState<number>(0);
  const [scanBrightness, setScanBrightness] = useState<number>(0);
  const [scanContrast, setScanContrast] = useState<number>(0);
  const [scanFilter, setScanFilter] = useState<'none' | 'grayscale' | 'hitam_putih' | 'dokumen' | 'perbaiki_warna'>('none');
  
  // Real-time Text-on-Image Editor overlay states
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrWords, setOcrWords] = useState<Array<{text: string, x: number, y: number, w: number, h: number, bg: string, color: string, fontSize: number}>>([]);
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  const [lastSelectedWordData, setLastSelectedWordData] = useState<{ bg: string, color: string, fontSize: number }>({
    bg: '#ffffff',
    color: '#000000',
    fontSize: 12
  });

  // Extended high-fidelity CamScan States matching Images 1-8
  const [camScanSubPage, setCamScanSubPage] = useState<'main' | 'crop' | 'edit' | 'view' | 'tools'>('main');
  const [camScanTabActive, setCamScanTabActive] = useState<'beranda' | 'file' | 'alat' | 'saya'>('beranda');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isWatermarkOpen, setIsWatermarkOpen] = useState(false);
  const [watermarkText, setWatermarkText] = useState('COPY');
  const [isPDFUtilitiesOpen, setIsPDFUtilitiesOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [isSignatureMode, setIsSignatureMode] = useState(false);
  const [isScribbling, setIsScribbling] = useState(false);
  const [isHapusCerdasMode, setIsHapusCerdasMode] = useState(false);
  const [camScanDocs, setCamScanDocs] = useState<Array<{
    id: string;
    name: string;
    date: string;
    time: string;
    originalImage: string;
    processedImage: string;
    warpedImage: string;
    corners: Array<{x: number, y: number}>;
    ocrWords: Array<{text: string, x: number, y: number, w: number, h: number, bg: string, color: string, fontSize: number}>;
    filter: 'none' | 'grayscale' | 'hitam_putih' | 'dokumen' | 'perbaiki_warna';
    rotation: number;
    brightness: number;
    contrast: number;
    pagesCount: number;
  }>>([]);

  // Populate default mock items for CamScan on boot
  useEffect(() => {
    if (camScanDocs.length > 0) return;
    
    // Canvas-based crisp mock visuals generator
    const generateMockDocThumbnail = (type: 'invoice' | 'register' | 'doc' | 'child' | 'portrait' | 'avatar') => {
      const canvas = document.createElement('canvas');
      canvas.width = 450;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      
      // Background base paper color
      ctx.fillStyle = type === 'invoice' || type === 'doc' ? '#faf9f5' : (type === 'register' ? '#f0fdf4' : '#f1f5f9');
      ctx.fillRect(0, 0, 450, 600);
      
      if (type === 'invoice') {
        // Red sales invoice with handdrawn rows matching Screen 5
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(30, 110, 390, 390);
        ctx.moveTo(30, 140); ctx.lineTo(420, 140);
        ctx.moveTo(100, 110); ctx.lineTo(100, 500);
        ctx.moveTo(300, 110); ctx.lineTo(300, 500);
        ctx.moveTo(370, 110); ctx.lineTo(370, 500);
        ctx.stroke();
        
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 15px Courier New, monospace';
        ctx.fillText('NOTA NO. ....................... 555', 35, 45);
        ctx.font = '10px sans-serif';
        ctx.fillText('Tanggal : 25/05/2026', 35, 70);
        ctx.fillText('Untuk Tuan / Toko : Jk Kucing', 35, 88);
        
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('Qty', 50, 128);
        ctx.fillText('NAMA BARANG', 140, 128);
        ctx.fillText('Harga', 315, 128);
        ctx.fillText('Jumlah', 380, 128);
        
        // Pen ink row
        ctx.fillStyle = '#1d4ed8'; 
        ctx.font = 'bold 13px Arial';
        ctx.fillText('49', 55, 165);
        ctx.fillText('Foto Ijazah', 115, 165);
        ctx.fillText('490.000', 374, 165);
        
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('Tanda terima', 50, 480);
        ctx.fillText('Jumlah Rp. 490.000', 285, 484);
        
        // Rubber seal stamp circle
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(135, 475, 23, 0, Math.PI*2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.font = 'bold 6px sans-serif';
        ctx.fillText('ATK FOTO & COPY', 111, 473);
        ctx.fillText('SARI SEJATI', 117, 480);
      } else if (type === 'register') {
        // Family Register (Kartu Keluarga)
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('KARTU KELUARGA', 160, 40);
        ctx.font = 'bold 9px monospace';
        ctx.fillText('No. 35171162401061872', 158, 54);
        
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(30, 80, 390, 440);
        for(let val = 110; val < 520; val += 30) {
          ctx.moveTo(30, val); ctx.lineTo(420, val);
        }
        ctx.stroke();
        
        ctx.fillStyle = '#065f46';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText('No  Nama Lengkap        NIK         Jenis Kelamin', 35, 98);
        ctx.fillStyle = '#111827';
        ctx.font = '8px sans-serif';
        ctx.fillText('1   MARIFIN JOMBANG     351756281   LAKI-LAKI', 35, 128);
        ctx.fillText('2   UMU MAHMUDAH        351756282   PEREMPUAN', 35, 158);
        ctx.fillText('3   MOHAMMAD RINALDI    351756283   LAKI-LAKI', 35, 188);
      } else if (type === 'doc') {
        // Document page
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 13px Georgia, serif';
        ctx.fillText('Laporan Evaluasi Layanan Pendidikan', 45, 55);
        ctx.font = '8px Georgia, serif';
        ctx.fillText('Lampiran Jombang, 24 Februari 2026', 45, 72);
        
        ctx.fillStyle = '#334155';
        ctx.font = '9px Georgia, serif';
        const rows = [
          "Kurikulum baru PAUD/TK KB Muslimat telah dirancang secara digital.",
          "Pengadaan materi pembelajaran berbasis AI interaktif.",
          "Tanggal 22-24 Februari 2026 dilaksanakan evaluasi mandiri.",
          "Penandatanganan nota kesepakatan bersama dengan dinas setempat."
        ];
        rows.forEach((r, idx) => {
          ctx.fillText((idx+1) + ". " + r, 45, 120 + idx * 40);
        });
        
        // yellow marks
        ctx.fillStyle = 'rgba(253, 224, 71, 0.45)';
        ctx.fillRect(43, 112, 330, 11);
        ctx.fillRect(43, 192, 210, 11);
      } else if (type === 'child') {
        // child photo red background
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(20, 20, 410, 560);
        
        ctx.fillStyle = '#fed7aa'; // Skin
        ctx.beginPath();
        ctx.arc(225, 230, 80, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#111827'; // Dark hair
        ctx.beginPath();
        ctx.arc(225, 185, 84, Math.PI, 0);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff'; // white eye
        ctx.beginPath();
        ctx.arc(195, 225, 12, 0, Math.PI*2);
        ctx.arc(255, 225, 12, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#0284c7'; // pupils
        ctx.beginPath();
        ctx.arc(195, 225, 6, 0, Math.PI*2);
        ctx.arc(255, 225, 6, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#dc2626'; // primary uniform
        ctx.beginPath();
        ctx.moveTo(150, 330);
        ctx.lineTo(300, 330);
        ctx.lineTo(380, 560);
        ctx.lineTo(70, 560);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#ffffff'; // collar
        ctx.beginPath();
        ctx.moveTo(200, 330);
        ctx.lineTo(225, 380);
        ctx.lineTo(250, 330);
        ctx.fill();
      } else if (type === 'portrait') {
        // child uniform blue blazer badge 28
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(20, 20, 410, 560);
        
        ctx.fillStyle = '#ffedd5'; // Skin
        ctx.beginPath();
        ctx.arc(225, 230, 75, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#451a03'; // Brown hair
        ctx.beginPath();
        ctx.arc(225, 185, 78, Math.PI, 0);
        ctx.fill();
        
        ctx.fillStyle = '#0284c7'; // blue clothing
        ctx.beginPath();
        ctx.moveTo(150, 330);
        ctx.lineTo(300, 330);
        ctx.lineTo(360, 560);
        ctx.lineTo(90, 560);
        ctx.closePath();
        ctx.fill();
        
        // badge 28
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(225, 430, 20, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('28', 216, 435);
      } else {
        // general avatar portrait
        ctx.fillStyle = '#065f46';
        ctx.fillRect(20, 20, 410, 560);
        
        ctx.fillStyle = '#ffedd5'; // Skin
        ctx.beginPath();
        ctx.arc(225, 230, 75, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = '#0f172a'; // blue blazer
        ctx.beginPath();
        ctx.moveTo(150, 330);
        ctx.lineTo(300, 330);
        ctx.lineTo(360, 560);
        ctx.lineTo(90, 560);
        ctx.closePath();
        ctx.fill();
      }
      
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.font = '9px monospace';
      ctx.fillText('CamScanner Digital Scanner LLC', 260, 580);
      
      return canvas.toDataURL('image/jpeg', 0.9);
    };

    const invoiceImg = generateMockDocThumbnail('invoice');
    const registerImg = generateMockDocThumbnail('register');
    const docImg = generateMockDocThumbnail('doc');
    const boyImg = generateMockDocThumbnail('child');
    const badgeImg = generateMockDocThumbnail('portrait');
    const otheImg = generateMockDocThumbnail('avatar');

    const defaultDocs = [
      {
        id: 'doc-invoice',
        name: 'CamScanner 25-05-2026 18.31',
        date: '25/05/2026',
        time: '18:31',
        originalImage: invoiceImg,
        processedImage: invoiceImg,
        warpedImage: invoiceImg,
        corners: [{x: 10, y: 15}, {x: 90, y: 15}, {x: 90, y: 85}, {x: 10, y: 85}],
        ocrWords: [
          { text: "Foto Ijazah", x: 26, y: 27, w: 25, h: 4, bg: "transparent", color: "#1d4ed8", fontSize: 13 },
          { text: "490.000", x: 74, y: 27, w: 15, h: 4, bg: "transparent", color: "#1d4ed8", fontSize: 13 }
        ],
        filter: 'none' as const,
        rotation: 0,
        brightness: 0,
        contrast: 0,
        pagesCount: 1
      },
      {
        id: 'doc-register',
        name: 'CamScanner 26-03-2026 13.52',
        date: '26/03/2026',
        time: '13:52',
        originalImage: registerImg,
        processedImage: registerImg,
        warpedImage: registerImg,
        corners: [{x: 5, y: 5}, {x: 95, y: 5}, {x: 95, y: 95}, {x: 5, y: 95}],
        ocrWords: [
          { text: "MARIFIN JOMBANG", x: 15, y: 19.5, w: 30, h: 3, bg: "transparent", color: "#111827", fontSize: 11 }
        ],
        filter: 'none' as const,
        rotation: 0,
        brightness: 0,
        contrast: 0,
        pagesCount: 1
      },
      {
        id: 'doc-text',
        name: 'CamScanner 13-02-2026 17.26',
        date: '13/02/2026',
        time: '17:26',
        originalImage: docImg,
        processedImage: docImg,
        warpedImage: docImg,
        corners: [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 90}, {x: 10, y: 90}],
        ocrWords: [],
        filter: 'none' as const,
        rotation: 0,
        brightness: 0,
        contrast: 0,
        pagesCount: 1
      },
      {
        id: 'doc-boy1',
        name: 'CamScanner 11-02-2026 09.04',
        date: '11/02/2026',
        time: '09:04',
        originalImage: boyImg,
        processedImage: boyImg,
        warpedImage: boyImg,
        corners: [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 90}, {x: 10, y: 90}],
        ocrWords: [],
        filter: 'none' as const,
        rotation: 0,
        brightness: 0,
        contrast: 0,
        pagesCount: 1
      },
      {
        id: 'doc-boy2',
        name: 'CamScanner 03-02-2026 20.56',
        date: '03/02/2026',
        time: '20:56',
        originalImage: badgeImg,
        processedImage: badgeImg,
        warpedImage: badgeImg,
        corners: [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 90}, {x: 10, y: 90}],
        ocrWords: [],
        filter: 'none' as const,
        rotation: 0,
        brightness: 0,
        contrast: 0,
        pagesCount: 1
      },
      {
        id: 'doc-girl1',
        name: 'CamScanner 03-02-2026 20.49',
        date: '03/02/2026',
        time: '20:49',
        originalImage: otheImg,
        processedImage: otheImg,
        warpedImage: otheImg,
        corners: [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 90}, {x: 10, y: 90}],
        ocrWords: [],
        filter: 'none' as const,
        rotation: 0,
        brightness: 0,
        contrast: 0,
        pagesCount: 1
      }
    ];
    setCamScanDocs(defaultDocs);
  }, []);


  interface BrowserTab {
    id: string;
    activeUrl: string;
    inputUrl: string;
    history: string[];
    historyIndex: number;
  }
  
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([{
      id: 'tab-initial',
      activeUrl: 'https://www.google.com/webhp?igu=1',
      inputUrl: 'https://www.google.com/webhp?igu=1',
      history: ['https://www.google.com/webhp?igu=1'],
      historyIndex: 0
  }]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-initial');
  const activeTab = browserTabs.find(t => t.id === activeTabId) || browserTabs[0];

  const updateActiveTab = (updates: Partial<BrowserTab>) => {
      setBrowserTabs(tabs => tabs.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };

  const [browserBookmarks, setBrowserBookmarks] = useState<{title: string, url: string}[]>([
      { title: 'Google', url: 'https://www.google.com/webhp?igu=1' },
      { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
      { title: 'GitHub', url: 'https://github.com' }
  ]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigateBrowser = (url: string) => {
    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
            finalUrl = 'https://' + url;
        } else {
            finalUrl = 'https://search.yahoo.com/search?p=' + encodeURIComponent(url);
        }
    }
    
    const newHistory = activeTab.history.slice(0, activeTab.historyIndex + 1);
    newHistory.push(finalUrl);
    
    updateActiveTab({
        inputUrl: finalUrl,
        activeUrl: finalUrl,
        history: newHistory,
        historyIndex: newHistory.length - 1
    });
  };

  const navigateRef = useRef(navigateBrowser);
  useEffect(() => {
    navigateRef.current = navigateBrowser;
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'BROWSER_NAVIGATE') {
        navigateRef.current(event.data.url);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleBrowserBack = () => {
      if (activeTab.historyIndex > 0) {
          const newIndex = activeTab.historyIndex - 1;
          updateActiveTab({
              historyIndex: newIndex,
              activeUrl: activeTab.history[newIndex],
              inputUrl: activeTab.history[newIndex]
          });
      }
  };

  const handleBrowserForward = () => {
      if (activeTab.historyIndex < activeTab.history.length - 1) {
          const newIndex = activeTab.historyIndex + 1;
          updateActiveTab({
              historyIndex: newIndex,
              activeUrl: activeTab.history[newIndex],
              inputUrl: activeTab.history[newIndex]
          });
      }
  };

  const handleBrowserHome = () => {
      navigateBrowser('https://www.google.com/webhp?igu=1');
  };

  const reloadBrowser = () => {
      const currentUrl = activeTab.activeUrl;
      updateActiveTab({ activeUrl: '' });
      setTimeout(() => updateActiveTab({ activeUrl: currentUrl }), 10);
  };
  
  const toggleBookmark = () => {
      const existing = browserBookmarks.findIndex(b => b.url === activeTab.activeUrl);
      if (existing >= 0) {
          setBrowserBookmarks(browserBookmarks.filter((_, i) => i !== existing));
      } else {
          try {
              const urlObj = new URL(activeTab.activeUrl);
              setBrowserBookmarks([...browserBookmarks, { title: urlObj.hostname.replace('www.', ''), url: activeTab.activeUrl }]);
          } catch (e) {
              setBrowserBookmarks([...browserBookmarks, { title: activeTab.activeUrl.substring(0, 20), url: activeTab.activeUrl }]);
          }
      }
  };

  const addNewTab = () => {
      const newTab: BrowserTab = {
          id: `tab-${Date.now()}`,
          activeUrl: 'https://www.google.com/webhp?igu=1',
          inputUrl: 'https://www.google.com/webhp?igu=1',
          history: ['https://www.google.com/webhp?igu=1'],
          historyIndex: 0
      };
      setBrowserTabs([...browserTabs, newTab]);
      setActiveTabId(newTab.id);
  };
  
  const closeTab = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (browserTabs.length === 1) {
          setIsBrowserOpen(false);
          return;
      }
      const newTabs = browserTabs.filter(t => t.id !== id);
      setBrowserTabs(newTabs);
      if (activeTabId === id) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
      }
  };

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<File | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    // Set persistence to local
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.warn("Auth persistence error:", err);
    });

    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log("Logged in via redirect:", result.user.email);
          setToast(`Selamat datang kembali, ${result.user.displayName || result.user.email}!`);
        }
      } catch (error: any) {
        console.error("Redirect Auth Error:", error);
        
        // Detailed error reporting for unauthorized domains
        if (error.code === 'auth/unauthorized-domain') {
          const origin = window.location.origin;
          setToast(`Domain ${origin} tidak terdaftar! Tambahkan ke 'Authorized Domains' di Firebase Console.`);
        } else if (error.code === 'auth/internal-error') {
          setToast("Login Redirect gagal. Periksa Authorized Domains & SHA-1 di Firebase.");
        } else if (error.code === 'auth/operation-not-supported-in-this-environment') {
          setToast("Redirect tidak didukung di environment ini. Gunakan browser standar.");
        }
      }
    };
    handleRedirect();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toPrecision(3)) + ' ' + sizes[i];
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg': case 'jpeg': case 'png': case 'gif': return ImageIcon;
      case 'mp4': case 'mov': case 'avi': return Film;
      case 'ts': case 'tsx': case 'js': case 'jsx': case 'css': case 'html': return FileCode;
      case 'pdf': return FileType;
      default: return DefaultFileIcon;
    }
  };

  const fetchLocalFilesOnly = async () => {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const localFiles = await res.json();
        return localFiles.map((lf: any) => ({
          name: lf.name,
          size: lf.size,
          storageName: lf.name,
          mtime: lf.mtime ? new Date(lf.mtime) : new Date(),
          birthtime: lf.birthtime ? new Date(lf.birthtime) : new Date(),
          uid: lf.uid,
        }));
      }
    } catch (err) {
      console.warn("Error fetching local files:", err);
    }
    return [];
  };

  const fetchFiles = () => {
    // Treat unverified email/password users as guest for data visibility
    const isUnverified = user?.providerData.some(p => p.providerId === 'password') && !user.emailVerified;
    
    if (!user || isUnverified) {
      fetchLocalFilesOnly().then((localFiles) => {
        // Guest/unverified should only see files that have no owner uid (shared/anonymous local files)
        const guestFiles = localFiles.filter((lf: any) => !lf.uid).map((lf: any) => ({
          ...lf,
          isCloud: false,
          isLocal: true
        }));
        setFiles(guestFiles);
      });
      return () => {};
    }

    try {
      const q = query(collection(db, 'files'), where('uid', '==', user.uid));
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const filesList: FileDetail[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          filesList.push({
            id: doc.id,
            name: data.name,
            size: data.size,
            storageName: data.storageName || data.name,
            mtime: data.mtime ? new Date(data.mtime) : new Date(),
            birthtime: data.birthtime ? new Date(data.birthtime) : new Date(),
            isCloud: true,
            isLocal: false
          });
        });

        const localFiles = await fetchLocalFilesOnly();
        localFiles.forEach((lf: any) => {
          const belongsToUser = user && lf.uid === user.uid;
          const isShared = !lf.uid;
          
          const existing = filesList.find(f => f.name === lf.name);
          if (existing) {
             existing.isLocal = true;
          } else {
             if (user) {
                if (belongsToUser) filesList.push({ ...lf, isCloud: false, isLocal: true });
             } else {
                if (isShared) filesList.push({ ...lf, isCloud: false, isLocal: true });
             }
          }
        });

        setFiles(filesList);
      }, async (error) => {
        console.error("Firestore Files Snapshot Error:", error);
        const localFiles = await fetchLocalFilesOnly();
        const belongsToUserOrShared = localFiles.filter((lf: any) => !lf.uid || lf.uid === user.uid).map((lf: any) => ({
          ...lf,
          isLocal: true,
          isCloud: false
        }));
        setFiles(belongsToUserOrShared);
        setToast("Failed to fetch files from cloud");
      });
      return unsubscribe;
    } catch(e) {
      console.error(e);
      return () => {};
    }
  };

  const refreshAllFiles = async () => {
    if (!user) {
      const localFiles = await fetchLocalFilesOnly();
      const guestFiles = localFiles.filter((lf: any) => !lf.uid).map((lf: any) => ({
        ...lf,
        isCloud: false,
        isLocal: true
      }));
      setFiles(guestFiles);
    } else {
      // For logged in users, we can't easily "force" a Firestore snapshot
      // but we can at least refresh the local files part of the state
      const localFiles = await fetchLocalFilesOnly();
      setFiles(prev => {
        // Let's just update the local files in the current state
        const merged: FileDetail[] = [];
        localFiles.forEach(lf => {
            const belongsToUser = lf.uid === user.uid;
            if (belongsToUser) {
                merged.push({ ...lf, isCloud: false, isLocal: true });
            }
        });
        prev.forEach(p => {
            const m = merged.find(item => item.name === p.name);
            if (m) {
                m.id = p.id;
                m.isCloud = p.isCloud;
            } else if (p.isCloud) {
                merged.push({ ...p, isLocal: false });
            }
        });
        return merged;
      });
    }
  };

  const MAX_STORAGE_BYTES = 100 * 1024 * 1024 * 1024; // 100GB

  useEffect(() => {
    const unsubscribe = fetchFiles();
    return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user, isGuest]);

  useEffect(() => {
    if (files) {
        const currentLimit = isGuest ? (10 * 1024 * 1024 * 1024) : MAX_STORAGE_BYTES;
        const totalUsed = files.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
        setStorageInfo({
            free: currentLimit - totalUsed,
            total: currentLimit,
            used: totalUsed,
            limit: currentLimit
        });
    } else {
        setStorageInfo(null);
    }
  }, [files, isGuest]);

  const sortedFiles = [...files].sort((a, b) => {
    let result = 0;
    if (sortBy === 'name') result = a.name.localeCompare(b.name);
    else if (sortBy === 'size') result = a.size - b.size;
    else if (sortBy === 'type') {
      const extA = a.name.split('.').pop() || '';
      const extB = b.name.split('.').pop() || '';
      result = extA.localeCompare(extB);
    }
    else result = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
    
    return sortOrder === 'desc' ? -result : result;
  });
  
  const filteredFiles = sortedFiles.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()) && !f.name.toLowerCase().endsWith('.json'));

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files?.[0]) setFileToUpload(e.dataTransfer.files[0]);
  };

  const handleLogin = async () => {
    try {
      console.log("Starting login attempt...");
      setToast("Menghubungkan ke Google...");
      setGoogleAuthError(null);

      // Check if we are in an iframe
      const isIframe = window.self !== window.top;
      if (isIframe) {
        setToast("Harap buka aplikasi di tab baru jika login terhenti.");
      }

      // Try standard original Google Sign-In with Popup
      await signInWithPopup(auth, googleProvider);
      
    } catch (error: any) {
      console.error("Login attempt failed:", error);
      setGoogleAuthError(error);
      
      if (error.code === 'auth/popup-blocked') {
        setToast("Popup diblokir! Izinkan popup untuk login.");
      } else if (error.code === 'auth/operation-not-allowed') {
        setToast("Provider Google belum aktif atau 'Self-registration' dimatikan di Firebase Console > Authentication > Settings.");
      } else if (error.code === 'auth/unauthorized-domain' || error.message.includes('unauthorized domain')) {
        const origin = window.location.origin;
        setToast(`Domain ${origin} belum terdaftar! Tambahkan ke 'Authorized Domains' di Firebase Console.`);
      } else if (error.code === 'auth/operation-not-supported-in-this-environment') {
        setToast("Environment tidak mendukung Popup. Mencoba Redirect...");
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectErr) {
          setToast("Gagal memulai login redirect.");
        }
      } else {
        setToast(`Gagal login: ${error.code || error.message}`);
      }
    }
  };

  const handleRedirectLogin = async () => {
    try {
      setToast("Mengalihkan ke halaman login Google...");
      setGoogleAuthError(null);
      await signInWithRedirect(auth, googleProvider);
    } catch (error: any) {
      console.error("Redirect login failure:", error);
      setGoogleAuthError(error);
      setToast(`Gagal login redirect: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsGuest(false);
    setToast("Berhasil logout.");
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsAuthLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(userCredential.user);
      setToast("Pendaftaran berhasil! Silakan periksa email Anda untuk verifikasi.");
      setAuthMode('login');
    } catch (error: any) {
      console.error("Signup error:", error);
      if (error.code === 'auth/operation-not-allowed') {
        setToast("Pendaftaran email belum aktif. Di Firebase Console > Authentication, pastikan 'Email/Password' aktif & 'Allow users to sign up' sudah dicentang di tab Settings.");
      } else {
        setToast(`Gagal daftar: ${error.message}`);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsAuthLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user.emailVerified) {
        setToast("Email belum diverifikasi. Silakan periksa kotak masuk Anda.");
        // We don't sign them out immediately, but the UI should show verification pending
      } else {
        setToast("Selamat datang kembali!");
        setAuthMode(null);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/operation-not-allowed') {
        setToast("Login email belum diaktifkan di Firebase Console. Silakan aktifkan 'Email/Password' di menu Authentication.");
      } else {
        setToast(`Gagal login: ${error.message}`);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setToast("Email reset password telah dikirim.");
      setAuthMode('login');
    } catch (error: any) {
      setToast(`Gagal: ${error.message}`);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const getFileDownloadUrl = async (filename: string): Promise<string> => {
    const fileItem = files.find(f => f.name === filename);
    if (fileItem?.isLocal) {
      return `/api/open/${encodeURIComponent(filename)}`;
    }
    if (fileItem?.isCloud && user) {
      try {
        const storageRef = ref(storage, `users/${user.uid}/${filename}`);
        const cloudUrl = await getDownloadURL(storageRef);
        return `/api/proxy?url=${encodeURIComponent(cloudUrl)}`;
      } catch (err) {
        console.warn("Storage download URL failed, falling back to local proxy", err);
      }
    }
    return `/api/open/${encodeURIComponent(filename)}`;
  };

  const getFileCategory = (filename: string): 'image' | 'video' | 'audio' | 'pdf' | 'office' | 'html' | 'text' | 'other' => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'ogg'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office';
    if (['html', 'htm'].includes(ext)) return 'html';
    if (['txt', 'json', 'js', 'css', 'ts', 'md', 'xml', 'yaml', 'yml'].includes(ext)) return 'text';
    return 'other';
  };

  useEffect(() => {
    let active = true;
    setIsEditing(false);
    setEditedContent('');
    setIsSaving(false);

    if (selectedFile) {
        getFileDownloadUrl(selectedFile.name)
            .then(url => {
                if (!active) return;
                setDownloadUrl(url);
                const category = getFileCategory(selectedFile.name);
                if (category === 'text' || category === 'html') {
                    setIsLoadingText(true);
                    setTextContent(null);
                    const fetchUrl = url.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
                    fetch(fetchUrl)
                        .then(r => {
                            if (!r.ok) throw new Error("HTTP error");
                            return r.text();
                        })
                        .then(text => {
                            if (active) {
                                const slicedText = text.slice(0, 100000); // limit preview to 100k chars for safety
                                setTextContent(slicedText);
                                setEditedContent(slicedText);
                                setIsLoadingText(false);
                            }
                        })
                        .catch(err => {
                            console.error("Failed to fetch text content:", err);
                            if (active) {
                                setTextContent("Gagal memuat isi file.");
                                setEditedContent("Gagal memuat isi file.");
                                setIsLoadingText(false);
                            }
                        });
                } else {
                    setTextContent(null);
                    setEditedContent('');
                }
            })
            .catch(err => {
                console.error("Failed to resolve dynamic URL:", err);
                if (active) {
                    setDownloadUrl(null);
                    setTextContent(null);
                    setEditedContent('');
                }
            });
    } else {
        setDownloadUrl(null);
        setTextContent(null);
        setEditedContent('');
    }
    return () => {
        active = false;
    };
  }, [selectedFile, user, files]);

  const handleSaveEditedFile = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
        const category = getFileCategory(selectedFile.name);
        const mimeType = category === 'html' ? 'text/html' : 'text/plain';
        
        if (selectedFile.isCloud && user) {
            // Save to Firebase Storage
            const storageRef = ref(storage, `users/${user.uid}/${selectedFile.name}`);
            const dataBlob = new Blob([editedContent], { type: mimeType });
            await uploadBytesResumable(storageRef, dataBlob);
            
            // Update metadata in Firestore (update mtime)
            await updateDoc(doc(db, 'files', `${user.uid}_${selectedFile.name}`), {
                mtime: new Date().toISOString(),
                size: dataBlob.size
            });
        } else {
            // Local fallback
            const payload: any = { content: editedContent };
            if (user) {
                payload.uid = user.uid;
            }
            const response = await fetch(`/api/save/${encodeURIComponent(selectedFile.name)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: "Gagal menyimpan file" }));
                throw new Error(errData.error || "Gagal menyimpan file");
            }
        }
        
        setToast("File berhasil disimpan!");
        setIsEditing(false);
        setTextContent(editedContent); 
        fetchFiles(); 
    } catch (err: any) {
        console.error("Error saving file:", err);
        setToast(`Gagal menyimpan: ${err.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  const renderCodeEditor = () => {
    if (!selectedFile) return null;
    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden h-[380px] flex flex-col bg-slate-950 text-slate-200 shadow-xl transition-all">
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1.5 font-semibold text-amber-400">
            <Edit2 size={12} className="animate-pulse" /> 
            Mengedit: {truncateFileName(selectedFile.name)}
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setIsEditing(false);
                setEditedContent(textContent || '');
              }}
              disabled={isSaving}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold transition-all disabled:opacity-50"
            >
              Batal
            </button>
            <button 
              onClick={handleSaveEditedFile}
              disabled={isSaving}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={10} className="animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Download size={10} />
                  Simpan
                </>
              )}
            </button>
          </div>
        </div>
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          disabled={isSaving}
          placeholder="Tulis isi file Anda di sini..."
          className="w-full flex-1 p-4 bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed resize-none outline-none focus:bg-slate-950 transition-colors select-text"
          spellCheck={false}
        />
        <div className="bg-slate-900 border-t border-slate-800 px-4 py-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Karakter: {editedContent.length}</span>
          <span className="text-cyan-400 font-semibold">UTF-8</span>
        </div>
      </div>
    );
  };

  // --- CamScan Core Logic & Image Core Math ---
  const startCamera = async () => {
    try {
      if (camScanStream) {
        camScanStream.getTracks().forEach(track => track.stop());
      }
      const constraints = {
        video: {
          facingMode: isRearCamera ? "environment" : "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCamScanStream(stream);
      setToast("Kamera belakang berhasil dicanangkan!");
    } catch (err) {
      console.error("Camera access error:", err);
      // Fallback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCamScanStream(stream);
        setToast("Kamera default dicanangkan!");
      } catch (fallbackErr) {
        setToast("Gagal mengakses kamera. Silakan gunakan tombol Import Gambar dari Galeri.");
      }
    }
  };

  const toggleCameraFacing = () => {
    setIsRearCamera(prev => !prev);
  };

  // Re-start camera when facingMode changes
  useEffect(() => {
    if (isCamScanOpen && !capturedImage) {
      startCamera();
    }
    return () => {
      if (camScanStream) {
        camScanStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isRearCamera, isCamScanOpen, capturedImage]);

  const capturePhoto = () => {
    if (!camScanStream) return;
    const video = document.getElementById("camscan-video") as HTMLVideoElement;
    if (!video) return;
    
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      setCapturedImage(dataUrl);
      resetScanAdjustmentParams();
      
      // Stop stream tracks
      camScanStream.getTracks().forEach(track => track.stop());
      setCamScanStream(null);
    }
  };

  const handleImportLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCapturedImage(event.target.result as string);
        resetScanAdjustmentParams();
        
        // Stop camera stream if active
        if (camScanStream) {
          camScanStream.getTracks().forEach(track => track.stop());
          setCamScanStream(null);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const resetScanAdjustmentParams = () => {
    setScannedCorners([
      {x: 10, y: 15},
      {x: 90, y: 15},
      {x: 90, y: 85},
      {x: 10, y: 85}
    ]);
    setIsWarped(false);
    setWarpedImage(null);
    setProcessedImage(null);
    setScanRotation(0);
    setScanBrightness(0);
    setScanContrast(0);
    setScanFilter('none');
    setOcrWords([]);
    setSelectedWordIdx(null);
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeCorner === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setScannedCorners(prev => {
      const updated = [...prev];
      updated[activeCorner] = { x, y };
      return updated;
    });
  };

  const runBilinearDeskewAndAlign = () => {
    if (!capturedImage) return;
    
    setLoading(true);
    setToast("Meluruskan & mengoreksi kemiringan dokumen...");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        // Output resolution targets: typical document ratio A4 (approx 1:1.414)
        const outWidth = 800;
        const outHeight = 1100;
        
        const canvas = document.createElement('canvas');
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setLoading(false);
          return;
        }
        
        // Create offscreen source canvas
        const sCanvas = document.createElement('canvas');
        sCanvas.width = img.naturalWidth;
        sCanvas.height = img.naturalHeight;
        const sCtx = sCanvas.getContext('2d');
        if (!sCtx) {
          setLoading(false);
          return;
        }
        sCtx.drawImage(img, 0, 0);
        const sData = sCtx.getImageData(0, 0, sCanvas.width, sCanvas.height);
        
        const dData = ctx.createImageData(outWidth, outHeight);
        
        // Get coordinates adjusted relative to pixels
        const sw = sCanvas.width;
        const sh = sCanvas.height;
        const x0 = (scannedCorners[0].x / 100) * sw;
        const y0 = (scannedCorners[0].y / 100) * sh;
        const x1 = (scannedCorners[1].x / 100) * sw;
        const y1 = (scannedCorners[1].y / 100) * sh;
        const x2 = (scannedCorners[2].x / 100) * sw;
        const y2 = (scannedCorners[2].y / 100) * sh;
        const x3 = (scannedCorners[3].x / 100) * sw;
        const y3 = (scannedCorners[3].y / 100) * sh;

        for (let v = 0; v < outHeight; v++) {
          const q = v / (outHeight - 1);
          const omq = 1 - q;
          for (let u = 0; u < outWidth; u++) {
            const p = u / (outWidth - 1);
            const omp = 1 - p;
            
            // Bilinear interpolation
            const wt0 = omp * omq;
            const wt1 = p * omq;
            const wt2 = p * q;
            const wt3 = omp * q;
            
            const sx = wt0 * x0 + wt1 * x1 + wt2 * x2 + wt3 * x3;
            const sy = wt0 * y0 + wt1 * y1 + wt2 * y2 + wt3 * y3;
            
            const isx = Math.max(0, Math.min(sw - 1, Math.round(sx)));
            const isy = Math.max(0, Math.min(sh - 1, Math.round(sy)));
            
            const srcIdx = (isy * sw + isx) * 4;
            const destIdx = (v * outWidth + u) * 4;
            
            dData.data[destIdx] = sData.data[srcIdx];
            dData.data[destIdx + 1] = sData.data[srcIdx + 1];
            dData.data[destIdx + 2] = sData.data[srcIdx + 2];
            dData.data[destIdx + 3] = sData.data[srcIdx + 3];
          }
        }
        
        ctx.putImageData(dData, 0, 0);
        const warpedUrl = canvas.toDataURL("image/jpeg", 0.9);
        setWarpedImage(warpedUrl);
        setProcessedImage(warpedUrl);
        setIsWarped(true);
        setToast("Dokumen berhasil diluruskan & dide-skew!");
      } catch (err) {
        console.error("Error doing bilinear warp:", err);
        setToast("Gagal melakukan perataan gambar.");
      } finally {
        setLoading(false);
      }
    };
    img.src = capturedImage;
  };

  const triggerFiltersAndEdits = () => {
    if (!warpedImage) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const rotationRad = (scanRotation * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rotationRad));
        const cos = Math.abs(Math.cos(rotationRad));
        
        const w = img.width;
        const h = img.height;
        const rotWidth = Math.round(w * cos + h * sin);
        const rotHeight = Math.round(w * sin + h * cos);
        
        const canvas = document.createElement('canvas');
        canvas.width = rotWidth;
        canvas.height = rotHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.translate(rotWidth / 2, rotHeight / 2);
        ctx.rotate(rotationRad);
        ctx.drawImage(img, -w / 2, -h / 2);
        
        const imgData = ctx.getImageData(0, 0, rotWidth, rotHeight);
        const pixels = imgData.data;
        
        const contrastFactor = (259 * (scanContrast + 255)) / (255 * (259 - scanContrast));
        
        for (let i = 0; i < pixels.length; i += 4) {
          let r = pixels[i];
          let g = pixels[i + 1];
          let b = pixels[i + 2];
          
          // Brightness
          if (scanBrightness !== 0) {
            r = Math.max(0, Math.min(255, r + scanBrightness));
            g = Math.max(0, Math.min(255, g + scanBrightness));
            b = Math.max(0, Math.min(255, b + scanBrightness));
          }
          
          // Contrast
          if (scanContrast !== 0) {
            r = Math.max(0, Math.min(255, contrastFactor * (r - 128) + 128));
            g = Math.max(0, Math.min(255, contrastFactor * (g - 128) + 128));
            b = Math.max(0, Math.min(255, contrastFactor * (b - 128) + 128));
          }
          
          // Advanced Document Filters
          if (scanFilter === 'grayscale') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = g = b = gray;
          } else if (scanFilter === 'hitam_putih') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const val = gray > 125 ? 255 : 0;
            r = g = b = val;
          } else if (scanFilter === 'dokumen') {
            // Brighten background paper dynamically while darkening text characters
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            if (gray > 110) {
              r = Math.min(255, r * 1.3 + 15);
              g = Math.min(255, g * 1.3 + 15);
              b = Math.min(255, b * 1.3 + 15);
            } else {
              r = Math.max(0, r * 0.7);
              g = Math.max(0, g * 0.7);
              b = Math.max(0, b * 0.7);
            }
          } else if (scanFilter === 'perbaiki_warna') {
            r = Math.max(0, Math.min(255, r * 1.15 + 10));
            g = Math.max(0, Math.min(255, g * 1.1 + 8));
            b = Math.max(0, Math.min(255, b * 1.25 + 15));
          }
          
          pixels[i] = r;
          pixels[i + 1] = g;
          pixels[i + 2] = b;
        }
        
        ctx.putImageData(imgData, 0, 0);
        setProcessedImage(canvas.toDataURL("image/jpeg", 0.95));
      } catch (err) {
        console.error("Error applying filters:", err);
      }
    };
    img.src = warpedImage;
  };

  useEffect(() => {
    if (warpedImage) {
      triggerFiltersAndEdits();
    }
  }, [scanRotation, scanBrightness, scanContrast, scanFilter, warpedImage]);

  const requestOcrAutoDetect = async () => {
    if (!processedImage) return;
    setIsOcrLoading(true);
    setToast("Menghubungi AI Gemini untuk mendeteksi koordinat teks...");
    
    try {
      const res = await fetch("/api/camscan/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: processedImage })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const errorText = await res.text();
        throw new Error(`Respons bervespa/bukan JSON: ${errorText.substring(0, 100)}`);
      }
      
      const data = await res.json();
      
      if (data.warning) {
        setToast(data.warning);
      }
      
      if (data.words && Array.isArray(data.words)) {
        const enriched = data.words.map((w: any) => ({
          text: w.text || "",
          x: w.x || 10,
          y: w.y || 10,
          w: w.w || 20,
          h: w.h || 4,
          bg: "#ffffff",
          color: "#000000",
          fontSize: 10
        }));
        setOcrWords(enriched);
        setToast(`AI Berhasil mendeteksi ${enriched.length} blok teks! Klik teks untuk mengedit.`);
      } else {
        setToast("Tidak ada teks terdeteksi. Silakan klik area bebas untuk menambahkan teks.");
      }
    } catch (err: any) {
      console.error("OCR Detect Fail:", err);
      setToast("Koneksi gagal / Offline. Silakan klik area gambar untuk menambahkan teks secara manual.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleContainerClickAddText = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // ignore bubbled pointer events from inside elements
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Add default Textbox
    const newWord = {
      text: "Teks Baru (Edit)",
      x: Math.max(1, Math.min(95, Number(xPercent.toFixed(1)) - 10)),
      y: Math.max(1, Math.min(95, Number(yPercent.toFixed(1)) - 2)),
      w: 24,
      h: 4,
      bg: "#ffffff",
      color: "#000000",
      fontSize: 10
    };
    setOcrWords(prev => [...prev, newWord]);
    setSelectedWordIdx(ocrWords.length); // autoselect it
  };

  const updateWordText = (idx: number, text: string) => {
    setOcrWords(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], text };
      return copy;
    });
  };

  const updateWordStyle = (idx: number, field: 'bg' | 'color' | 'fontSize' | 'x' | 'y' | 'w' | 'h', value: any) => {
    setOcrWords(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const deleteWordBox = (idx: number) => {
    setOcrWords(prev => prev.filter((_, i) => i !== idx));
    setSelectedWordIdx(null);
  };

  // Compile final merged canvas representing the base corrected image + editable text blocks drawn on top
  const compileFinalCompositeCanvas = (): Promise<HTMLCanvasElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Gagal kompilasi canvas"));
            return;
          }
          
          // 1. Draw modified image
          ctx.drawImage(img, 0, 0);
          
          // 2. Overlay textboxes
          for (const w of ocrWords) {
            const rx = (w.x / 100) * canvas.width;
            const ry = (w.y / 100) * canvas.height;
            const rw = (w.w / 100) * canvas.width;
            const rh = (w.h / 100) * canvas.height;
            
            // Draw solid masking background if chosen
            if (w.bg && w.bg !== "transparent") {
              ctx.fillStyle = w.bg;
              ctx.fillRect(rx, ry, rw, rh);
            }
            
            // Draw text
            ctx.fillStyle = w.color || "#000000";
            const calculatedFontSize = Math.floor((w.fontSize / 100) * canvas.height); // adaptive text height
            ctx.font = `bold ${calculatedFontSize}px Inter, sans-serif`;
            ctx.textBaseline = "middle";
            ctx.fillText(w.text, rx + 4, ry + rh / 2, rw - 8);
          }
          
          resolve(canvas);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = processedImage || warpedImage || capturedImage || "";
    });
  };

  const saveToLocalFilesAndTriggerDownload = async (isImage: boolean) => {
    setLoading(true);
    setToast("Mempersiapkan export dokumen...");
    try {
      const compositeCanvas = await compileFinalCompositeCanvas();
      const finalBase64 = compositeCanvas.toDataURL("image/png");
      const timestamp = Date.now();
      
      if (isImage) {
        // Trigger browser PNG image download
        const downLink = document.createElement("a");
        downLink.download = `Scan_${timestamp}.png`;
        downLink.href = finalBase64;
        downLink.click();
        
        // Save to virtual file manager server folder
        const res = await fetch(finalBase64);
        const blob = await res.blob();
        const file = new File([blob], `Scan_${timestamp}.png`, { type: "image/png" });
        
        // Upload to server path
        const formData = new FormData();
        formData.append("file", file);
        if (user) formData.append("uid", user.uid);
        
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
        
        if (uploadRes.ok) {
          setToast("Gambar berhasil tersimpan ke Galeri HP & File Manager Cloud!");
          fetchFiles();
        } else {
          setToast("Gambar tersimpan ke Galeri, gagal diunggah otomatis ke File Manager.");
        }
      } else {
        // Save as MS Word Office Docx
        const rawOcrTexts = ocrWords.map(w => ({ text: w.text }));
        const response = await fetch("/api/camscan/save-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: finalBase64,
            filename: `Scan_${timestamp}.docx`,
            textBlocks: rawOcrTexts,
            uid: user ? user.uid : undefined
          })
        });
        
        if (response.ok) {
          setToast("Dokumen Office Word (.docx) tersimpan di Cloud Storage!");
          fetchFiles();
          
          // Download directly
          const downRes = await response.json();
          const docxDownloadUrl = `/api/open/${encodeURIComponent(downRes.name)}`;
          const downLink = document.createElement("a");
          downLink.download = downRes.name;
          downLink.href = docxDownloadUrl;
          downLink.click();
        } else {
          throw new Error("Gagal membuat dokumen Office");
        }
      }
    } catch (err: any) {
      console.error("Export fail:", err);
      setToast("Gagal melakukan ekspor: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const executeUpload = async (file: File) => {
    setLoading(true);
    setUploadProgress(0);
    setUploadSpeed(null);

    const filename = file.name;
    const currentLimit = isGuest ? (10 * 1024 * 1024 * 1024) : MAX_STORAGE_BYTES;
    const totalUsed = files.reduce((acc, f) => acc + (Number(f.size) || 0), 0);
    if (totalUsed + file.size > currentLimit) {
        setLoading(false);
        setToast(`Gagal: Kapasitas penyimpanan penuh (Maks ${isGuest ? '10GB' : '100GB'})`);
        return;
    }

    // Modern local storage helper with progress animation
    const uploadToLocalServer = (fileToUpload: File, uid?: string) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', fileToUpload);
      if (uid) {
          formData.append('uid', uid);
      }

      const startTime = performance.now();
      let lastTime = startTime;
      let lastLoaded = 0;

      // Realtime mock progress guarantees a moving bar and disables "stuck on 0" layout
      let currentProgress = 0;
      const simulateInterval = setInterval(() => {
          currentProgress = Math.min(currentProgress + (95 - currentProgress) * 0.15, 95);
          setUploadProgress(currentProgress);
          const elapsed = (performance.now() - startTime) / 1000;
          const speed = (fileToUpload.size * (currentProgress / 100)) / (elapsed || 0.1);
          setUploadSpeed(formatBytes(speed) + '/s');
      }, 150);

      xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
              const percent = (e.loaded / e.total) * 100;
              if (percent > currentProgress) {
                  currentProgress = percent;
                  setUploadProgress(percent);
              }
              const now = performance.now();
              const timeDiff = (now - lastTime) / 1000;
              if (e.loaded === e.total) {
                  const totalElapsed = (now - startTime) / 1000;
                  const speed = e.total / (totalElapsed || 0.1);
                  setUploadSpeed(formatBytes(speed) + '/s');
              } else if (timeDiff >= 0.2) {
                  const bytesDiff = e.loaded - lastLoaded;
                  const speed = bytesDiff / (timeDiff || 0.1);
                  setUploadSpeed(formatBytes(speed) + '/s');
                  lastTime = now;
                  lastLoaded = e.loaded;
              }
          }
      });

      xhr.addEventListener('load', async () => {
          clearInterval(simulateInterval);
          if (xhr.status >= 200 && xhr.status < 300) {
              setUploadProgress(100);
              setUploadSpeed('Completed');
              setToast(uid ? 'File disimpan di Penyimpanan (Cloud-Sync)' : 'File diunggah (Lokal)');
              
              if (uid) {
                  try {
                      await setDoc(doc(db, 'files', `${uid}_${filename}`), {
                          name: filename,
                          storageName: filename,
                          uid: uid,
                          size: fileToUpload.size,
                          mtime: new Date().toISOString(),
                          birthtime: new Date().toISOString()
                      });

                      // Asynchronously back up file content to Firebase Storage
                      const storageRef = ref(storage, `users/${uid}/${filename}`);
                      uploadBytesResumable(storageRef, fileToUpload)
                          .then(() => {
                              console.log("File content successfully backed up to Firebase Storage");
                          })
                          .catch((fbErr) => {
                              console.warn("Storage cloud backup skipped or failed:", fbErr);
                          });
                  } catch (dbErr) {
                      console.warn("Firestore save metadata warning:", dbErr);
                  }
              }

              fetchFiles();

              setTimeout(() => {
                  setFileToUpload(null);
                  setLoading(false);
                  setUploadProgress(0);
                  setUploadSpeed(null);
              }, 1200);
          } else {
              setLoading(false);
              setToast('Gagal unggah ke server lokal');
              setUploadProgress(0);
              setUploadSpeed(null);
          }
      });

      xhr.addEventListener('error', () => {
           clearInterval(simulateInterval);
           setLoading(false);
           setToast('Kesalahan jaringan saat unggah');
           setUploadProgress(0);
           setUploadSpeed(null);
      });

      xhr.addEventListener('timeout', () => {
           clearInterval(simulateInterval);
           setLoading(false);
           setToast('Unggah kedaluwarsa (Timeout)');
           setUploadProgress(0);
           setUploadSpeed(null);
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    };

    // Use unified fast local server saving with automatic database synchronization!
    uploadToLocalServer(file, user?.uid);
  };

  const handleUpload = () => {
    if (!fileToUpload) return;

    if (files.some(f => f.name === fileToUpload.name)) {
        setOverwriteTarget(fileToUpload);
        return;
    }
    
    executeUpload(fileToUpload);
  };

  const handleRemoteDownload = async (urlToDownload?: string) => {
    const urlStr = urlToDownload || remoteUrl;
    if (!urlStr) return;
    setIsDownloadingRemote(true);
    setRemoteDownloadProgress(0);
    setRemoteDownloadSpeed('0 B/s');
    setRemoteDownloadLoaded(0);
    setRemoteDownloadTotal(0);
    const currentUrl = urlStr;
    if (!urlToDownload) {
      setRemoteUrl('');
    }
    
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(currentUrl)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error('Failed to download from URL');
        
        const contentLength = res.headers.get('content-length');
        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        setRemoteDownloadTotal(total);
        let loaded = 0;
        
        const reader = res.body?.getReader();
        const chunks: Uint8Array[] = [];
        let blob: Blob;
        
        if (reader) {
            try {
                const startTime = performance.now();
                let lastTime = startTime;
                let lastLoaded = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        const now = performance.now();
                        const totalElapsed = (now - startTime) / 1000;
                        const finalSpeed = loaded / (totalElapsed || 0.1);
                        setRemoteDownloadSpeed(formatBytes(finalSpeed) + '/s');
                        break;
                    }
                    
                    chunks.push(value);
                    loaded += value.length;
                    setRemoteDownloadLoaded(loaded);
                    
                    if (total > 0) {
                        const percent = (loaded / total) * 100;
                        setRemoteDownloadProgress(Math.min(Math.floor(percent), 99));
                    } else {
                        setRemoteDownloadProgress(50);
                    }

                    const now = performance.now();
                    const timeDiff = (now - lastTime) / 1000;
                    if (timeDiff >= 0.2) {
                        const bytesDiff = loaded - lastLoaded;
                        const speed = bytesDiff / (timeDiff || 0.1);
                        setRemoteDownloadSpeed(formatBytes(speed) + '/s');
                        lastTime = now;
                        lastLoaded = loaded;
                    }
                }
                blob = new Blob(chunks, { type: contentType });
            } catch (readErr) {
                console.warn("Reader failed, using blob fallback", readErr);
                blob = await res.blob();
            }
        } else {
            blob = await res.blob();
        }
        
        let fileName = currentUrl.split('/').pop()?.split('?')[0] || 'url_file';
        fileName = decodeURIComponent(fileName).trim();
        if (!fileName || fileName === "" || fileName === "localhost" || fileName.includes("cookie") || fileName.length > 100) {
            fileName = 'downloaded_file';
        }
        
        if (!fileName.includes('.')) {
            const ext = contentType.split('/')[1]?.split(';')[0] || '';
            if (ext && ext !== 'octet-stream' && ext.length < 5) {
                fileName = `${fileName}.${ext}`;
            } else {
                fileName = `${fileName}.bin`;
            }
        }
        
        const file = new File([blob], fileName, { type: contentType });
        
        setToast('Remote file downloaded. Saving...');
        executeUpload(file);
    } catch (e) {
        console.error(e);
        setToast('Error downloading remote file');
    } finally {
        setIsDownloadingRemote(false);
        setRemoteDownloadProgress(null);
        setRemoteDownloadSpeed(null);
        setRemoteDownloadLoaded(0);
        setRemoteDownloadTotal(0);
    }
  };

  const toggleSelection = (filename: string) => {
    const next = new Set(selectedFiles);
    if (next.has(filename)) next.delete(filename);
    else next.add(filename);
    setSelectedFiles(next);
  };

  const handleDownload = async (filename: string) => {
    setDownloadProgresses(prev => ({ ...prev, [filename]: 0 }));
    
    try {
        let url = await getFileDownloadUrl(filename);
        if (url.startsWith('http')) {
            url = `/api/proxy?url=${encodeURIComponent(url)}`;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error('Download failed');
        
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;
        
        const reader = response.body!.getReader();
        const chunks = [];
        
        while(true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            chunks.push(value);
            loaded += value.length;

            const progress = total > 0 ? (loaded / total) * 100 : 50;
            setDownloadProgresses(prev => ({ ...prev, [filename]: progress }));
        }
        
        const blob = new Blob(chunks);
        const urlObj = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlObj;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(urlObj);
        
    } catch(e) {
        console.error(e);
        setToast('Network error during download');
    } finally {
        setDownloadProgresses(prev => {
            const next = { ...prev };
            delete next[filename];
            return next;
        });
    }
  };

  const handleRenameClick = (oldName: string) => {
    setRenameTarget(oldName);
    setRenameInput(oldName);
  };

  const executeRename = async () => {
    if (!renameTarget || !renameInput || renameInput === renameTarget) {
        setRenameTarget(null);
        return;
    }
    try {
        const fileDetail = files.find(f => f.name === renameTarget);
        if (!fileDetail) throw new Error("File not found");

        try {
            await fetch('/api/rename', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldName: renameTarget, newName: renameInput, uid: user?.uid || null })
            });
        } catch (err) {
            console.warn("Local API rename failed/skipped:", err);
        }

        if (user) {
            const docId = `${user.uid}_${fileDetail.storageName || fileDetail.name}`;
            await updateDoc(doc(db, 'files', docId), {
                name: renameInput,
                mtime: new Date().toISOString()
            });
        }
        setToast('File renamed');
        fetchFiles();
    } catch (e) {
        console.error(e);
        setToast('Rename failed');
    } finally {
        setRenameTarget(null);
    }
  };

  const handleDeleteClick = (filenames: string[]) => {
      setDeleteTarget(filenames);
  };

  const executeDelete = async () => {
      if (!deleteTarget) return;
      try {
          await Promise.all(deleteTarget.map(async (name) => {
              const fileDetail = files.find(f => f.name === name);

              try {
                  const url = user ? `/api/delete/${encodeURIComponent(name)}?uid=${user.uid}` : `/api/delete/${encodeURIComponent(name)}`;
                  await fetch(url, { method: 'DELETE' });
              } catch (err) {
                  console.warn("Local API delete failed/skipped:", err);
              }

              if (user && fileDetail) {
                  const storageName = fileDetail.storageName || fileDetail.name;
                  const storageRef = ref(storage, `users/${user.uid}/${storageName}`);
                  try {
                      await deleteObject(storageRef);
                  } catch (err) {
                      console.warn("Storage deletion warning (might not exist):", err);
                  }
                  try {
                      await deleteDoc(doc(db, 'files', `${user.uid}_${storageName}`));
                  } catch (err) {
                      console.warn("Firestore document deletion warning:", err);
                  }
              }
          }));
          setSelectedFiles(new Set());
          setToast('File(s) deleted successfully');
          fetchFiles();
      } catch (e) {
          console.error(e);
          setToast('Delete failed');
      } finally {
          setDeleteTarget(null);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between border-b pb-6">
          <div className="flex items-center gap-3">
             <img src={logo} alt="Logo" className="h-32 md:h-36 w-auto object-contain" referrerPolicy="no-referrer" />
          </div>
          <div className="flex flex-col items-end gap-2.5 bg-white border border-slate-100 px-4 py-3 rounded-2xl shadow-sm">
            {(user || isGuest) && (
              <div className="text-right flex flex-col items-end pr-1">
                {user ? (
                  <>
                    <div className="text-xs font-bold text-slate-800 font-sans">
                      {user.displayName || user.email?.split('@')[0] || 'Dimension Auth User'}
                    </div>
                    {user.email && (
                      <div className="text-[10px] text-slate-400 font-mono select-all">
                        {user.email}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs font-bold text-slate-500 font-sans flex items-center gap-1.5 justify-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>Mode Tamu (Guest)</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-4 border-t border-slate-50 pt-2 w-full justify-end">
            {(user || isGuest) ? (
              <div className="flex items-center gap-3">
                {user && !user.emailVerified && user.providerData.some(p => p.providerId === 'password') && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                    <Sparkles size={10} /> Verifikasi Email
                  </span>
                )}
                <button onClick={handleLogout} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-full text-sm font-medium text-slate-700 transition-colors">
                  <LogOut size={16} /> Logout
                </button>
              </div>
            ) : (
                <button onClick={() => setAuthMode('login')} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700">
                  <LogIn size={16} /> Login
                </button>
            )}
            </div>
            {storageInfo && (user || isGuest) && (
              <div 
                onClick={() => setIsFileManagerOpen(true)}
                className="flex items-center gap-2 text-slate-500 bg-white border px-3 py-1.5 rounded-full text-xs shadow-sm ring-1 ring-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
                title="Go to File Manager"
              >
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={[{name: 'Used', value: storageInfo.used}, {name: 'Free', value: storageInfo.limit - storageInfo.used}]} dataKey="value" innerRadius={5} outerRadius={8} paddingAngle={0}>
                                    <Cell fill="#3b82f6" />
                                    <Cell fill="#e2e8f0" />
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <span>{formatBytes(storageInfo.used)} / {formatBytes(storageInfo.limit)}</span>
                </div>
              </div>
            )}
          </div>
        </header>
        
        {toast && (
            <div className={`fixed bottom-4 right-4 ${toast.includes('tidak terdaftar') || toast.includes('Gagal') || toast.includes('Error') ? 'bg-red-600' : 'bg-green-600'} text-white px-6 py-3 rounded-xl shadow-lg z-[200]`}>
                {toast}
            </div>
        )}
        {selectedFile && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]" onClick={() => setSelectedFile(null)}>
                <div className={`bg-white p-6 rounded-2xl space-y-4 w-full ${['video', 'pdf', 'html', 'text'].includes(getFileCategory(selectedFile.name)) ? 'max-w-2xl' : 'max-w-md'} shadow-2xl transition-all max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold truncate pr-8 relative">
                      {truncateFileName(selectedFile.name)}
                      <button onClick={() => setSelectedFile(null)} className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                        <X size={16} />
                      </button>
                    </h3>
                    
                    <div className="flex-1 overflow-y-auto py-2 space-y-4">
                      {/* Interactive Handler/Preview Section based on file type */}
                      {(() => {
                        const fileCat = getFileCategory(selectedFile.name);
                        
                        if (!downloadUrl) {
                          return (
                            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                              <RefreshCw size={24} className="animate-spin mb-2" />
                              <span>Loading preview...</span>
                            </div>
                          );
                        }
                        
                        switch (fileCat) {
                          case 'image':
                            return (
                              <div className="bg-slate-50 rounded-xl p-2 border border-slate-100 flex items-center justify-center min-h-[200px] max-h-[350px] overflow-hidden">
                                <img src={downloadUrl} alt={selectedFile.name} className="max-h-[320px] object-contain rounded shadow-sm" referrerPolicy="no-referrer" />
                              </div>
                            );
                          case 'video':
                            return (
                              <div className="bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
                                <video src={downloadUrl} controls className="w-full max-h-[360px]" />
                              </div>
                            );
                          case 'audio':
                            return (
                              <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg animate-pulse">
                                  <Music size={28} />
                                </div>
                                <div className="text-center w-full">
                                  <p className="text-xs text-slate-400 font-mono tracking-wider uppercase mb-1">Playing Audio</p>
                                  <p className="text-sm font-semibold text-slate-800 truncate px-4">{truncateFileName(selectedFile.name)}</p>
                                </div>
                                <audio src={downloadUrl} controls className="w-full mt-2" />
                              </div>
                            );
                          case 'pdf':
                            return (
                              <div className="border border-slate-200 rounded-xl overflow-hidden h-[380px] bg-slate-100 shadow-inner">
                                <iframe src={downloadUrl} className="w-full h-full" title={selectedFile.name} />
                              </div>
                            );
                          case 'html':
                            if (isEditing) {
                              return renderCodeEditor();
                            }
                            return (
                              <div className="border border-slate-200 rounded-xl overflow-hidden h-[380px] bg-white relative flex flex-col shadow-sm">
                                <div className="bg-slate-50 px-4 py-2 border-b flex items-center justify-between text-[11px] font-mono text-slate-500">
                                  <span className="flex items-center gap-1.5"><Globe size={12} className="text-emerald-500" /> Interactive HTML Preview</span>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => {
                                        setEditedContent(textContent || '');
                                        setIsEditing(true);
                                      }}
                                      className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[10px] font-semibold flex items-center gap-1 transition-all"
                                    >
                                      <Edit2 size={11} /> Edit HTML
                                    </button>
                                    <span className="text-emerald-600 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span> Live
                                    </span>
                                  </div>
                                </div>
                                <iframe src={downloadUrl} className="w-full flex-1" title={selectedFile.name} sandbox="allow-scripts allow-same-origin" />
                              </div>
                            );
                          case 'office':
                            return (
                              <div className="bg-sky-50 rounded-xl p-6 border border-sky-100 flex flex-col items-center text-center space-y-4">
                                <div className="w-16 h-16 bg-sky-100 rounded-2xl flex items-center justify-center text-sky-600 shadow-sm">
                                  <FileText size={32} />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-slate-800 text-sm">Dokumen Office ({selectedFile.name.split('.').pop()?.toUpperCase()})</h4>
                                  <p className="text-xs text-slate-500 max-w-sm mt-1 mb-2">Terintegrasi dengan Office Online Viewer untuk preview instan.</p>
                                </div>
                                <div className="flex flex-col gap-2 w-full pt-1">
                                  <a 
                                    href={`https://docs.google.com/viewer?url=${encodeURIComponent(window.location.origin + downloadUrl)}&embedded=true`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-center bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 transition-colors shadow-sm"
                                  >
                                    Preview via Google Docs
                                  </a>
                                  <a 
                                    href={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(window.location.origin + downloadUrl)}`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-center border border-sky-300 text-sky-700 bg-white rounded-lg py-2 font-medium hover:bg-sky-50 transition-colors"
                                  >
                                    Preview via Microsoft Office
                                  </a>
                                </div>
                                <div className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 p-2.5 rounded-lg w-full max-w-xs leading-normal">
                                  📌 <strong>Catatan Edit:</strong> File Office (.docx, .xlsx, .pptx) adalah file biner. Untuk mengedit, harap buka file secara lokal di Office Anda, lalu upload kembali file terbaru ke sini.
                                </div>
                              </div>
                            );
                          case 'text':
                            if (isEditing) {
                              return renderCodeEditor();
                            }
                            return (
                              <div className="border border-slate-200 rounded-xl overflow-hidden h-[320px] flex flex-col bg-slate-950 text-slate-200 shadow-lg">
                                <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-400">
                                  <span className="flex items-center gap-1.5"><FileCode size={13} className="text-cyan-400" /> File Reader</span>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => {
                                        setEditedContent(textContent || '');
                                        setIsEditing(true);
                                      }}
                                      className="px-2 py-1 bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-800 rounded text-[10px] font-semibold flex items-center gap-1 transition-all"
                                    >
                                      <Edit2 size={11} /> Edit File
                                    </button>
                                    <button 
                                      onClick={() => {
                                        if (textContent) {
                                          navigator.clipboard.writeText(textContent);
                                          setToast("Copied content to clipboard!");
                                        }
                                      }}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] transition-all"
                                    >
                                      Copy Raw
                                    </button>
                                  </div>
                                </div>
                                <div className="flex-1 p-4 overflow-auto font-mono text-[11px] leading-relaxed text-left whitespace-pre-wrap select-text selection:bg-cyan-800 selection:text-white">
                                  {isLoadingText ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
                                      <RefreshCw size={16} className="animate-spin" />
                                      <span>Membaca isi file...</span>
                                    </div>
                                  ) : (
                                    textContent || "File kosong atau tidak dapat terbaca."
                                  )}
                                </div>
                              </div>
                            );
                          default:
                            return (
                              <div className="bg-slate-50 rounded-xl p-8 border border-slate-100 flex flex-col items-center justify-center text-center space-y-3">
                                <div className="w-16 h-16 bg-slate-200 rounded-2xl flex items-center justify-center text-slate-500">
                                  <DefaultFileIcon size={32} />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-700 text-sm">Preview Tidak Tersedia</p>
                                  <p className="text-xs text-slate-400 max-w-xs mt-1">Gunakan tombol Open File di bawah untuk membuka file ini secara langsung.</p>
                                </div>
                              </div>
                            );
                        }
                      })()}

                      {/* File Metadata Details Panel */}
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-1.5 font-sans">
                        <div className="flex justify-between"><span className="text-slate-500">Ukuran file:</span> <span className="font-semibold text-slate-700">{formatBytes(selectedFile.size)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Dibuat pada:</span> <span className="text-slate-700">{new Date(selectedFile.birthtime).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Modifikasi terakhir:</span> <span className="text-slate-700">{new Date(selectedFile.mtime).toLocaleString()}</span></div>
                      </div>
                    </div>

                    {/* Action buttons footer */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <button 
                        onClick={() => setSelectedFile(null)} 
                        className="w-full bg-slate-900 text-white rounded-xl py-2.5 font-medium hover:bg-slate-800 transition-colors text-sm shadow-md"
                      >
                        Close
                      </button>
                      <a 
                        href={downloadUrl || undefined} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="flex items-center justify-center gap-2 w-full border border-slate-200 bg-white text-slate-700 rounded-xl py-2.5 font-medium hover:bg-slate-50 transition-all text-sm shadow-sm"
                      >
                        <ExternalLink size={15} /> Open File (Buka File)
                      </a>
                    </div>
                </div>
            </div>
        )}
        {(user || isGuest) ? (
          <>
            {isFileManagerOpen ? (
                <div className="fixed inset-0 bg-slate-50 z-40 overflow-y-auto flex flex-col">
                    <div className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                        <h1 className="text-2xl font-bold flex items-center gap-2"><HardDrive className="text-blue-600" /> File Manager</h1>
                        <div className="flex items-center gap-2">
                            <button onClick={() => fetchFiles()} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors" title="Refresh Files">
                                <RefreshCw size={16} /> Refresh
                            </button>
                            <button onClick={() => setIsFileManagerOpen(false)} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors"><X size={18} /> Close</button>
                        </div>
                    </div>
                    <div className="p-8 max-w-5xl mx-auto w-full">
                        <section id="file-manager">
                          <div className="flex items-center justify-end mb-4 ml-1">
                            <div className="flex items-center gap-2">
                                {selectedFiles.size > 0 && (
                                    <button onClick={() => handleDeleteClick(Array.from(selectedFiles))} className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
                                        <Trash2 size={16} /> Delete ({selectedFiles.size})
                                    </button>
                                )}
                                <div className="relative">
                                    <button 
                                        onClick={() => setIsViewMenuOpen(true)}
                                        className="flex items-center gap-2 border rounded-xl px-4 py-2 text-sm bg-white hover:bg-slate-50 transition-colors"
                                    >
                                        <LayoutGrid size={16} /> View Options
                                    </button>
                                    
                                    {isViewMenuOpen && (
                                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsViewMenuOpen(false)}>
                                            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-between mb-6">
                                                    <h3 className="text-lg font-bold text-slate-800">Tampilan & Urutan</h3>
                                                    <button onClick={() => setIsViewMenuOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                                                        <X size={20} />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-3 gap-4 mb-6">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('icon'); setViewSize('large'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'icon' && viewSize === 'large' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><LayoutGrid size={28} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Ikon Besar</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('icon'); setViewSize('medium'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'icon' && viewSize === 'medium' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><LayoutGrid size={24} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Ikon Sedang</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('icon'); setViewSize('small'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'icon' && viewSize === 'small' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><LayoutGrid size={20} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Ikon Kecil</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('list'); setViewSize('large'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'list' && viewSize === 'large' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><Menu size={28} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Daftar Besar</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('list'); setViewSize('medium'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'list' && viewSize === 'medium' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><Menu size={24} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Daftar Sedang</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('list'); setViewSize('small'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'list' && viewSize === 'small' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><Menu size={20} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Daftar Kecil</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('detail'); setViewSize('large'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'detail' && viewSize === 'large' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><List size={28} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Detail Besar</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('detail'); setViewSize('medium'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'detail' && viewSize === 'medium' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><List size={24} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Detail Sedang</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-2">
                                                        <button onClick={() => { setViewMode('detail'); setViewSize('small'); }} className={`p-4 rounded-xl transition-all ${viewMode === 'detail' && viewSize === 'small' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><List size={20} /></button>
                                                        <span className="text-xs text-slate-600 font-medium">Detail Kecil</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="relative flex py-4 items-center">
                                                    <div className="flex-grow border-t border-slate-200"></div>
                                                    <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-semibold uppercase">Urutkan</span>
                                                    <div className="flex-grow border-t border-slate-200"></div>
                                                </div>
                                                
                                                <div className="grid grid-cols-4 gap-4 mt-2">
                                                    <div className="text-center text-xs text-slate-500 font-medium mb-1">Nama</div>
                                                    <div className="text-center text-xs text-slate-500 font-medium mb-1">Jenis</div>
                                                    <div className="text-center text-xs text-slate-500 font-medium mb-1">Ukuran</div>
                                                    <div className="text-center text-xs text-slate-500 font-medium mb-1">Diubah</div>
                                                    
                                                    <button onClick={() => { setSortBy('name'); setSortOrder('asc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'name' && sortOrder === 'asc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><ArrowDownAZ size={20} /></button>
                                                    <button onClick={() => { setSortBy('type'); setSortOrder('asc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'type' && sortOrder === 'asc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><Type size={20} /></button>
                                                    <button onClick={() => { setSortBy('size'); setSortOrder('asc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'size' && sortOrder === 'asc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><SortAsc size={20} /></button>
                                                    <button onClick={() => { setSortBy('date'); setSortOrder('asc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'date' && sortOrder === 'asc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><Calendar size={20} /></button>
                                                    
                                                    <button onClick={() => { setSortBy('name'); setSortOrder('desc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'name' && sortOrder === 'desc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><ArrowUpZA size={20} /></button>
                                                    <button onClick={() => { setSortBy('type'); setSortOrder('desc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'type' && sortOrder === 'desc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><Type size={20} className="rotate-180" /></button>
                                                    <button onClick={() => { setSortBy('size'); setSortOrder('desc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'size' && sortOrder === 'desc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><SortDesc size={20} /></button>
                                                    <button onClick={() => { setSortBy('date'); setSortOrder('desc'); }} className={`flex justify-center p-3 rounded-xl transition-all ${sortBy === 'date' && sortOrder === 'desc' ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500 shadow-sm' : 'hover:bg-slate-100 text-slate-500 border border-slate-200'}`}><Calendar size={20} className="rotate-180" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-2 top-2.5 text-slate-400" size={16} />
                                    <input 
                                        type="text" 
                                        placeholder="Search files..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-8 pr-4 py-2 border rounded-xl text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                          </div>
                          <div className={`grid ${viewMode === 'icon' ? (viewSize === 'large' ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4' : viewSize === 'medium' ? 'grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3' : 'grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-2') : viewMode === 'list' ? (viewSize === 'large' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2') : 'grid-cols-1 gap-2'}`}>
                            {filteredFiles.map((file) => {
                              if (viewMode === 'icon') {
                                  const iconSizeClass = viewSize === 'large' ? 'w-full aspect-square' : viewSize === 'medium' ? 'w-full aspect-square' : 'w-full aspect-square';
                                  const iconInnerSize = viewSize === 'large' ? 48 : viewSize === 'medium' ? 32 : 24;
                                  
                                  return (
                                      <div key={file.name} onClick={() => setSelectedFile(file)} className="relative group flex flex-col items-center bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden pb-2">
                                          <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <input type="checkbox" checked={selectedFiles.has(file.name)} onChange={(e) => { e.stopPropagation(); toggleSelection(file.name); }} className="rounded w-4 h-4 bg-white/80" />
                                          </div>
                                          <div className={`flex items-center justify-center bg-slate-50 ${iconSizeClass}`}>
                                              <FilePreviewIcon file={file} user={user} className="w-full h-full object-cover" iconSize={iconInnerSize} />
                                          </div>
                                          <span className="text-xs font-medium text-slate-700 mt-2 px-2 text-center truncate w-full">{truncateFileName(file.name)}</span>
                                      </div>
                                  );
                              }
                              
                              if (viewMode === 'list') {
                                  const paddingClass = viewSize === 'large' ? 'p-4' : viewSize === 'medium' ? 'p-3' : 'p-2';
                                  const iconInnerSize = viewSize === 'large' ? 24 : viewSize === 'medium' ? 20 : 16;
                                  const textSizeClass = viewSize === 'large' ? 'text-sm' : viewSize === 'medium' ? 'text-xs' : 'text-[10px]';
                                  
                                  return (
                                      <div key={file.name} onClick={() => setSelectedFile(file)} className={`flex items-center gap-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer ${paddingClass}`}>
                                          <input type="checkbox" checked={selectedFiles.has(file.name)} onChange={(e) => { e.stopPropagation(); toggleSelection(file.name); }} className="rounded" />
                                          <div className="flex-shrink-0">
                                              <FilePreviewIcon file={file} user={user} className={`${viewSize === 'large' ? 'w-10 h-10' : viewSize === 'medium' ? 'w-8 h-8' : 'w-6 h-6'} object-cover rounded shadow-sm`} iconSize={iconInnerSize} />
                                          </div>
                                          <div className={`flex-1 truncate font-medium text-slate-700 ${textSizeClass}`}>{truncateFileName(file.name)}</div>
                                      </div>
                                  );
                              }
                              
                              const detailPaddingClass = viewSize === 'large' ? 'p-4' : viewSize === 'medium' ? 'p-3' : 'p-2';
                              const detailIconBoxSize = viewSize === 'large' ? 'w-12 h-12' : viewSize === 'medium' ? 'w-10 h-10' : 'w-8 h-8';
                              const detailIconInnerSize = viewSize === 'large' ? 24 : viewSize === 'medium' ? 20 : 16;
                              
                              return (
                              <div key={file.name} onClick={() => setSelectedFile(file)} className={`flex items-center gap-4 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer ${detailPaddingClass}`}>
                                <input type="checkbox" checked={selectedFiles.has(file.name)} onChange={(e) => { e.stopPropagation(); toggleSelection(file.name); }} className="rounded" />
                                
                                <div className="flex items-center gap-1">
                                    <FilePreviewIcon file={file} user={user} className={`${detailIconBoxSize} object-cover rounded-lg border`} iconSize={detailIconInnerSize} />
                                </div>
                                
                                <div className="flex-1 flex flex-col">
                                    <span className={`font-medium text-slate-700 ${viewSize === 'small' ? 'text-xs' : 'text-sm'}`}>{truncateFileName(file.name)}</span>
                                    {viewSize !== 'small' && (
                                        <span className="text-xs text-slate-500 uppercase font-semibold">{file.name.split('.').pop() || 'Unknown'}</span>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <span>{formatBytes(file.size)}</span>
                                        <span>•</span>
                                        <span>{new Date(file.mtime).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <button 
                                        onClick={async () => {
                                            try {
                                                const url = await getFileDownloadUrl(file.name);
                                                window.open(url, '_blank');
                                            } catch (e) {
                                                setToast("Failed to open file");
                                            }
                                        }} 
                                        className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 text-xs font-semibold pb-1.5 transition-colors" 
                                        title="View/Play"
                                    >
                                        Open
                                    </button>
                                    <button onClick={() => handleDownload(file.name)} className="p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" title="Download">
                                        {downloadProgresses[file.name] !== undefined ? <span className='text-xs text-blue-900 font-bold'>{downloadProgresses[file.name].toFixed(0)}%</span> : <Download size={18} />}
                                    </button>
                                    <button onClick={() => handleRenameClick(file.name)} className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors" title="Rename"><Edit2 size={18} /></button>
                                    <button onClick={() => handleDeleteClick([file.name])} className="p-2 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={18} /></button>
                                </div>
                              </div>
                            )})}
                          </div>
                        </section>
                    </div>
                </div>
            ) : (
            <section className="bg-white p-6 rounded-2xl border shadow-sm ring-1 ring-slate-100">
              <h2 className="text-lg font-semibold mb-4">Upload Files</h2>
          <div className="flex flex-col gap-4">
              <label 
                  onDragOver={(e) => { if (!loading) { e.preventDefault(); setIsDragOver(true); } }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => { if (!loading) onDrop(e); }}
                  className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 transition-colors ${loading ? 'cursor-not-allowed opacity-60 pointer-events-none' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50' } ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300' }`}>
                  <input 
                    type="file" 
                    disabled={loading}
                    onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <Plus className="text-slate-400" />
                  <span className="text-slate-600 font-medium font-sans">
                    {fileToUpload ? fileToUpload.name : 'Choose a file to upload'}
                  </span>
                  {fileToUpload && !loading && (
                    <button onClick={(e) => { e.preventDefault(); setFileToUpload(null); }} className="text-slate-400 hover:text-red-500">
                      <X size={16} />
                    </button>
                  )}
                </label>
                
                <button 
                  onClick={handleUpload}
                  disabled={!fileToUpload || loading}
                  className="w-full h-12 flex justify-center items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-all font-medium"
                >
                  <Upload size={18} />
                  <span>{loading ? 'Uploading...' : 'Upload File'}</span>
                </button>

                {/* Highly visible, high-contrast local upload progress card */}
                {loading && (
                  <div className="w-full bg-slate-900 text-white rounded-xl p-4 shadow-lg border border-slate-800 space-y-2 relative overflow-hidden mt-3">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2 font-medium">
                        <span className={`w-2 h-2 rounded-full ${uploadProgress >= 100 ? 'bg-emerald-400' : 'bg-emerald-500 animate-pulse'}`}></span>
                        <span className="truncate max-w-[180px] text-slate-200">
                          {uploadProgress >= 100 ? 'Uploaded' : 'Uploading'} {fileToUpload?.name}
                        </span>
                      </div>
                      <span className="font-mono text-emerald-400 font-bold text-xs bg-slate-800 px-2 py-0.5 rounded">
                        {uploadProgress.toFixed(1)}%
                      </span>
                    </div>

                    {/* Progress tracking track bar */}
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-150 ease-out ${uploadProgress >= 100 ? 'bg-emerald-400' : 'bg-emerald-500'} shadow-[0_0_8px_rgba(16,185,129,0.5)]`} 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>

                    {/* Details row */}
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                      <span>{formatBytes((uploadProgress / 100) * (fileToUpload?.size || 0))} / {formatBytes(fileToUpload?.size || 0)}</span>
                      {uploadSpeed ? (
                        <span className="text-emerald-300 font-semibold">{uploadSpeed}</span>
                      ) : (
                        <span>Calculating speed...</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-6 pt-6 border-t flex flex-col gap-4">
                  <input 
                      type="text" 
                      value={remoteUrl} 
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      placeholder="Enter remote file URL" 
                      className="w-full border rounded-xl px-4 py-3"
                  />
                  <button 
                      onClick={() => handleRemoteDownload()}
                      disabled={!remoteUrl || isDownloadingRemote}
                      className="w-full h-12 flex justify-center items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all font-medium"
                  >
                      <Download size={18} /> 
                      <span>{isDownloadingRemote ? 'Downloading...' : 'Download from URL'}</span>
                  </button>

                  {/* Highly visible, high-contrast remote download progress card */}
                  {isDownloadingRemote && (
                    <div className="w-full bg-blue-950 text-white rounded-xl p-4 shadow-lg border border-blue-900 space-y-2 relative overflow-hidden">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                          <span className="text-slate-200">Downloading raw file bytes</span>
                        </div>
                        <span className="font-mono text-sky-300 font-bold text-xs bg-blue-900 px-2 py-0.5 rounded">
                          {remoteDownloadProgress !== null ? `${remoteDownloadProgress.toFixed(0)}%` : '0%'}
                        </span>
                      </div>

                      {/* Progress tracking track bar */}
                      <div className="w-full bg-blue-900 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-sky-400 h-full rounded-full transition-all duration-150 ease-out shadow-[0_0_8px_rgba(56,189,248,0.5)]" 
                          style={{ width: `${remoteDownloadProgress !== null ? remoteDownloadProgress : 0}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                        <span>{formatBytes(remoteDownloadLoaded)} / {remoteDownloadTotal > 0 ? formatBytes(remoteDownloadTotal) : 'Unknown size'}</span>
                        <span className="text-sky-300 font-semibold">{remoteDownloadSpeed || 'Calculating...'}</span>
                      </div>
                    </div>
                  )}
                  
                  <button 
                      onClick={() => setIsBrowserOpen(true)}
                      className="w-full flex justify-center items-center gap-2 bg-slate-100 text-slate-700 px-6 py-3 rounded-xl hover:bg-slate-200 transition-all font-medium border border-slate-200 mb-2"
                  >
                        <Globe size={18} className="text-blue-500" />
                        Open Web Browser
                  </button>

                  <button 
                      onClick={() => {
                        setAutoScanRequest(true);
                        setIsCamScanOpen(true);
                        resetScanAdjustmentParams();
                      }}
                      className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-3 rounded-xl transition-all font-semibold shadow-md active:scale-95 border border-emerald-500/25"
                  >
                        <Camera size={18} />
                        Sken Dokumen (CamScan)
                  </button>
              </div>
            </section>
            )}

            {isBrowserOpen && (
                <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col">
                    {/* Tabs Bar */}
                    <div className="bg-slate-200 px-2 pt-2 flex items-end gap-1 overflow-x-auto no-scrollbar">
                        {browserTabs.map(tab => {
                            let title = 'New Tab';
                            try { if (tab.activeUrl) title = new URL(tab.activeUrl).hostname.replace('www.', ''); } catch(e) {}
                            return (
                                <div key={tab.id} onClick={() => setActiveTabId(tab.id)} className={`flex items-center gap-2 max-w-[200px] min-w-[120px] px-3 py-2 rounded-t-lg text-xs font-medium cursor-pointer transition-colors ${activeTabId === tab.id ? 'bg-white text-slate-800' : 'bg-slate-300/50 hover:bg-slate-300 text-slate-600'}`}>
                                    <Globe size={14} className={activeTabId === tab.id ? "text-blue-500" : "text-slate-400"} />
                                    <span className="flex-1 truncate">{title}</span>
                                    <button onClick={(e) => closeTab(tab.id, e)} className={`p-0.5 rounded-full text-slate-400 hover:text-slate-600 ${activeTabId === tab.id ? 'hover:bg-slate-200' : 'hover:bg-slate-400/30'}`}>
                                        <X size={12} />
                                    </button>
                                </div>
                            );
                        })}
                        <button onClick={addNewTab} className="p-1 mb-1.5 ml-1 hover:bg-slate-300 rounded-full text-slate-600 transition-colors">
                            <Plus size={16} />
                        </button>
                    </div>
                    {/* Navigation / Address Bar */}
                    <div className="bg-white px-4 py-2 flex flex-col gap-2 shadow-sm z-20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <button onClick={handleBrowserBack} disabled={activeTab.historyIndex === 0} className="p-2 disabled:opacity-50 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Back">
                                    <ArrowLeft size={18} />
                                </button>
                                <button onClick={handleBrowserForward} disabled={activeTab.historyIndex === activeTab.history.length - 1} className="p-2 disabled:opacity-50 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Forward">
                                    <ArrowRight size={18} />
                                </button>
                                <button onClick={reloadBrowser} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Reload">
                                    <RotateCw size={18} />
                                </button>
                                <button onClick={() => window.open(activeTab.activeUrl, '_blank')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Open in New Tab">
                                    <ExternalLink size={18} />
                                </button>
                                <button onClick={handleBrowserHome} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-colors" title="Home">
                                    <Home size={18} />
                                </button>
                                <button 
                                    onClick={() => setIsProxySettingsOpen(true)} 
                                    className="p-2 hover:bg-purple-100 bg-purple-50 rounded-full text-purple-600 transition-colors flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold" 
                                    title="Java & JavaScript Proxy Settings"
                                >
                                    <Terminal size={14} />
                                    <span>Java Proxy</span>
                                </button>
                                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                <button onClick={() => setIsBrowserOpen(false)} className="p-2 hover:bg-red-100 bg-red-50 rounded-full text-red-600 transition-colors" title="Close Browser">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setIsBrowserOpen(false); handleRemoteDownload(activeTab.activeUrl); }} className="flex items-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-xl text-sm font-medium transition-colors" title="Download this URL">
                                    <Download size={16} /> <span className="hidden sm:inline">Download URL</span>
                                </button>
                            </div>
                        </div>
                        
                        {/* Address Bar Row */}
                        <div className="relative w-full flex items-center border border-slate-200 bg-slate-100 rounded-full overflow-hidden hover:bg-white hover:border-slate-300 transition-colors focus-within:bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                            <span className="pl-4 text-slate-400"><Globe size={16} /></span>
                            <input 
                                type="text" 
                                value={activeTab.inputUrl}
                                onChange={(e) => updateActiveTab({ inputUrl: e.target.value })}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        navigateBrowser(activeTab.inputUrl);
                                    }
                                }}
                                className="w-full px-3 py-2 bg-transparent border-none text-sm focus:outline-none"
                                placeholder="Search Web or type a URL"
                            />
                            <button onClick={() => navigateBrowser(activeTab.inputUrl)} className="pr-3 text-slate-400 hover:text-blue-500 transition-colors" title="Go">
                                <ArrowRight size={18} />
                            </button>
                            <button onClick={toggleBookmark} className="pr-2 text-slate-400 hover:text-yellow-500 transition-colors" title="Bookmark">
                                <Star size={18} className={browserBookmarks.some(b => b.url === activeTab.activeUrl) ? "fill-yellow-400 text-yellow-500" : ""} />
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(activeTab.activeUrl); setToast('URL copied to clipboard'); }} className="pr-4 text-slate-400 hover:text-blue-500 transition-colors" title="Copy URL">
                                <Copy size={18} />
                            </button>
                        </div>
                    </div>
                    {/* Bookmarks Bar */}
                    <div className="bg-slate-100 px-4 py-1.5 flex items-center gap-4 overflow-x-auto border-b border-slate-200 shadow-sm z-10 w-full no-scrollbar">
                        {browserBookmarks.map((bookmark, idx) => (
                            <button key={idx} onClick={() => navigateBrowser(bookmark.url)} className="flex flex-shrink-0 items-center gap-1.5 px-2 py-1 hover:bg-slate-200 rounded text-xs font-medium text-slate-600 transition-colors truncate max-w-xs">
                                <Globe size={12} className="text-slate-400" />
                                {bookmark.title}
                            </button>
                        ))}
                    </div>
                    {/* Tab Contents */}
                    <div className="flex-1 w-full relative bg-white flex flex-col">
                        {browserTabs.map(tab => (
                            <div key={tab.id} style={{ display: activeTabId === tab.id ? 'flex' : 'none' }} className="flex-1 w-full h-full flex flex-col">
                                {!tab.activeUrl ? (
                                    <div className="flex-1 flex items-center justify-center bg-white text-slate-400">Loading...</div>
                                ) : (
                                    <iframe 
                                        src={useJsProxy ? `/api/browser-proxy?url=${encodeURIComponent(tab.activeUrl)}&injectJs=${encodeURIComponent(proxyJsCode)}&userAgent=${encodeURIComponent(proxyUserAgent)}` : tab.activeUrl} 
                                        className="w-full flex-1 border-none bg-white"
                                        title={`Integrated Web Browser - ${tab.id}`}
                                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[80vh] py-12 px-4 text-center select-none bg-slate-50">
            <div className="bg-white p-8 md:p-10 rounded-3xl w-full max-w-md flex flex-col gap-6 shadow-2xl border border-slate-100 transition-all duration-300 font-sans">
              <div className="flex flex-col items-center">
                <img src={logo} alt="Splash Logo" className="h-32 w-auto object-contain mb-4 drop-shadow-lg animate-bounce duration-1000" style={{ animationDuration: '6s' }} />
                <h2 className="text-2xl md:text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Welcome to Dimension Cloud</h2>
                <p className="text-slate-400 text-xs md:text-sm max-w-xs leading-relaxed">Kelola file dan dokumen Anda dengan aman di cloud terdesentralisasi.</p>
              </div>

              {/* Troubleshooting Alert for Google Login Failure */}
              {googleAuthError && (
                <div className="bg-amber-50 border border-amber-200 text-left p-4 rounded-2xl flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-start gap-2 text-amber-800">
                    <Sparkles className="text-amber-600 shrink-0 mt-0.5" size={16} />
                    <div className="text-xs font-bold">Google Login Terkendala?</div>
                  </div>
                  <div className="text-[11px] text-amber-700 leading-normal pl-6 space-y-1">
                    <p>
                      <strong>Penyebab Umum:</strong> Domain aplikasi belum terdaftar sebagai Authorized Domain di Firebase Console, atau provider Google belum diaktifkan.
                    </p>
                    <p className="border-t border-amber-200/60 pt-1.5 mt-1.5">
                      <strong>Cara Solusi di Firebase:</strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Buka <strong>Firebase Console</strong> proyek Anda.</li>
                      <li>Pilih menu <strong>Authentication</strong> &gt; Tab <strong>Settings</strong> &gt; <strong>Authorized domains</strong>.</li>
                      <li>Tambahkan domain ini: <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[10px] select-all font-bold text-amber-900">{window.location.host}</code></li>
                      <li>Pastikan provider <strong className="text-amber-900">Google</strong> sudah diaktifkan di tab <strong>Sign-in method</strong>.</li>
                    </ol>
                  </div>
                  <div className="flex items-center gap-2 pl-6 mt-1 border-t border-amber-200/60 pt-2 text-[10px]">
                    <span className="text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]">Error: {googleAuthError?.code || "Unconfigured"}</span>
                    <button 
                      onClick={handleRedirectLogin} 
                      className="ml-auto bg-amber-600 hover:bg-amber-700 text-white font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
                    >
                      <ExternalLink size={10} /> Coba Redirect
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {/* Method 1: Google Login */}
                <button 
                  onClick={handleLogin} 
                  className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white w-full py-3.5 px-6 rounded-2xl font-bold shadow-lg shadow-blue-100 hover:shadow-blue-200 transition-all active:scale-[0.98] group"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 bg-white p-0.5 rounded-full" />
                  <span className="text-sm">Masuk dengan Google</span>
                </button>

                {/* Divider */}
                <div className="relative py-2 my-1">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                  <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-wider text-slate-300"><span className="bg-white px-3">Atau Opsi Alternatif</span></div>
                </div>

                {/* Method 2: Email Password Login */}
                <button 
                  onClick={() => setAuthMode('login')} 
                  className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
                >
                  <FileText size={16} className="text-slate-500" />
                  <span>Gunakan Email &amp; Password</span>
                </button>

                {/* Method 3: Guest Login */}
                <button 
                  onClick={() => { setAuthMode(null); setIsGuest(true); }}
                  className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white w-full py-3 rounded-2xl font-bold text-sm transition-all shadow-md shadow-slate-100 active:scale-[0.98] group"
                >
                  <HardDrive size={16} className="text-slate-400 group-hover:text-blue-400 transition-colors" />
                  <span>Masuk sebagai Tamu (Maks 10GB)</span>
                </button>
              </div>

              <div className="text-[10px] text-slate-400">
                Dengan melanjutkan, Anda menyetujui Ketentuan Layanan & Kebijakan Privasi platform Dimension Cloud.
              </div>
            </div>
          </div>
        )}
        
        {/* Modals for actions */}
        {isProxySettingsOpen && (
            <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-[110]" onClick={() => setIsProxySettingsOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal size={20} />
                            <h3 className="text-lg font-bold">Java & JS Script Proxy Settings</h3>
                        </div>
                        <button onClick={() => setIsProxySettingsOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors text-white">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Proxy JavaScript / Java Proxy memungkinkan pemuatan situs eksternal yang dibatasi (seperti CORS/Frame Ancestors) ke dalam Iframe terintegrasi dengan memotong header perlindungan dan menyuntikkan script dinamis secara real-time.
                        </p>

                        {/* Status Toggle */}
                        <div className="bg-purple-50 p-4 rounded-xl flex items-center justify-between border border-purple-100">
                            <div>
                                <h4 className="text-sm font-semibold text-purple-900">Aktifkan Java/JS Proxy</h4>
                                <p className="text-xs text-purple-700">Rute semua navigasi web browser melalui proxy server</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={useJsProxy} 
                                    onChange={(e) => setUseJsProxy(e.target.checked)} 
                                    className="sr-only peer" 
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
                            </label>
                        </div>

                        {/* Custom JS Area */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold text-slate-700">Skrip JavaScript yang Disuntikkan (Injection):</label>
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-mono">Run On Load</span>
                            </div>
                            <textarea
                                value={proxyJsCode}
                                onChange={(e) => setProxyJsCode(e.target.value)}
                                rows={6}
                                className="w-full text-xs font-mono p-3 bg-slate-900 text-green-400 rounded-xl border border-slate-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                placeholder="// Tulis kode javascript di sini..."
                            />
                        </div>

                        {/* Script Presets */}
                        <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-slate-500">Preset Skrip Siap Pakai:</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    type="button"
                                    onClick={() => setProxyJsCode("console.log('[Java Proxy] Java Script Active!');\nalert('Halo dari Java/JS Proxy!');")}
                                    className="p-2 border rounded-lg text-left text-xs bg-slate-50 hover:bg-purple-50 text-slate-700 transition-colors"
                                >
                                    👋 Alert Sederhana
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setProxyJsCode("console.log('[Java Proxy] Injecting Styles...');\nconst style = document.createElement('style');\nstyle.innerHTML = 'html, body, div, p, span, h1, h2, h3, h4, h5, h6 { background-color: #0f172a !important; color: #f8fafc !important; }';\ndocument.head.appendChild(style);")}
                                    className="p-2 border rounded-lg text-left text-xs bg-slate-50 hover:bg-purple-50 text-slate-700 transition-colors"
                                >
                                    🌙 Dark Mode Injector
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setProxyJsCode("console.log('[Java Proxy] Tracking Link Clicks...');\ndocument.querySelectorAll('a').forEach(link => {\n  link.style.border = '2px dashed red';\n  link.title = 'Proxied Link';\n});")}
                                    className="p-2 border rounded-lg text-left text-xs bg-slate-50 hover:bg-purple-50 text-slate-700 transition-colors"
                                >
                                    🔗 Detektor Tautan (Borders)
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setProxyJsCode("console.log('[Java Proxy] Form Debugger Loaded!');\nconst inps = document.querySelectorAll('input');\ninps.forEach(i => {\n  i.style.backgroundColor = 'yellow';\n  i.addEventListener('input', (e) => console.log('Ketik:', e.target.value));\n});")}
                                    className="p-2 border rounded-lg text-left text-xs bg-slate-50 hover:bg-purple-50 text-slate-700 transition-colors"
                                >
                                    📝 Highlight Element Form
                                </button>
                            </div>
                        </div>

                        {/* User Agent Settings */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Custom User-Agent Header:</label>
                            <input 
                                type="text"
                                value={proxyUserAgent}
                                onChange={(e) => setProxyUserAgent(e.target.value)}
                                className="w-full text-xs p-2 border rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-50 px-6 py-4 flex gap-3 border-t">
                        <button 
                            onClick={() => {
                                setUseJsProxy(true);
                                setProxyJsCode("console.log('[Java Proxy] Active!');");
                                setProxyUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36");
                            }}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold px-4 py-2 rounded-xl transition-colors font-sans"
                        >
                            Reset ke Default
                        </button>
                        <div className="flex-1"></div>
                        <button 
                            onClick={() => {
                                setIsProxySettingsOpen(false);
                                reloadBrowser();
                                setToast('Setelan Proxy berhasil diterapkan. Memuat ulang...');
                            }} 
                            className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-6 py-2 rounded-xl transition-colors font-sans"
                        >
                            Simpan & Terapkan
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {renameTarget && (
            <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-50">
                <div className="bg-white p-6 rounded-2xl w-full max-w-sm flex flex-col gap-4 shadow-xl">
                    <h3 className="text-lg font-bold">Rename File</h3>
                    <input 
                        type="text" 
                        value={renameInput} 
                        onChange={e => setRenameInput(e.target.value)} 
                        className="border rounded-xl px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => setRenameTarget(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2 font-medium transition-colors">Cancel</button>
                        <button onClick={executeRename} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 font-medium transition-colors">Save</button>
                    </div>
                </div>
            </div>
        )}
        
        {deleteTarget && (
            <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-50">
                <div className="bg-white p-6 rounded-2xl w-full max-w-sm flex flex-col gap-4 shadow-xl">
                    <h3 className="text-lg font-bold text-red-600">Delete File(s)</h3>
                    <p className="text-slate-600">Are you sure you want to delete {deleteTarget.length} file(s)? This action cannot be undone.</p>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2 font-medium transition-colors">Cancel</button>
                        <button onClick={executeDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2 font-medium transition-colors">Delete</button>
                    </div>
                </div>
            </div>
        )}
        
        {overwriteTarget && (
            <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-50">
                <div className="bg-white p-6 rounded-2xl w-full max-w-sm flex flex-col gap-4 shadow-xl">
                    <h3 className="text-lg font-bold text-yellow-600">Overwrite File</h3>
                    <p className="text-slate-600">File <strong>{overwriteTarget.name}</strong> already exists. Are you sure you want to overwrite it?</p>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => setOverwriteTarget(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2 font-medium transition-colors">Cancel</button>
                        <button onClick={() => { setOverwriteTarget(null); executeUpload(overwriteTarget); }} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl py-2 font-medium transition-colors">Overwrite</button>
                    </div>
                </div>
            </div>
        )}

        {isCamScanOpen && (
            <CamScanSimulator
                isOpen={isCamScanOpen}
                onClose={() => { setIsCamScanOpen(false); setAutoScanRequest(false); }}
                user={user}
                files={files}
                fetchFiles={refreshAllFiles}
                setToast={setToast}
                autoScan={autoScanRequest}
            />
        )}

        {authMode && (
         <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[150] backdrop-blur-sm shadow-2xl">
           <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
             <div className="p-6 space-y-4">
               <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold text-slate-800">
                   {authMode === 'login' ? 'Masuk' : authMode === 'signup' ? 'Daftar Akun' : 'Reset Password'}
                 </h3>
                 <button onClick={() => setAuthMode(null)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                   <X size={20} />
                 </button>
               </div>

               {authMode !== 'forgot' && (
                 <p className="text-xs text-slate-500">
                   {authMode === 'login' ? 'Masuk dengan email pendaftaran Anda.' : 'Daftar untuk mulai mengelola file di cloud.'}
                 </p>
               )}

               <form onSubmit={authMode === 'login' ? handleEmailLogin : authMode === 'signup' ? handleEmailSignup : handleForgotPassword} className="space-y-3">
                 <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
                   <input 
                     type="email" 
                     value={email} 
                     onChange={e => setEmail(e.target.value)} 
                     className="w-full border-2 border-slate-100 rounded-xl px-4 py-2.5 focus:border-blue-500 focus:outline-none transition-all text-sm" 
                     placeholder="nama@email.com"
                     required
                   />
                 </div>
                 
                 {authMode !== 'forgot' && (
                   <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Password</label>
                     <input 
                       type="password" 
                       value={password} 
                       onChange={e => setPassword(e.target.value)} 
                       className="w-full border-2 border-slate-100 rounded-xl px-4 py-2.5 focus:border-blue-500 focus:outline-none transition-all text-sm" 
                       placeholder="••••••••"
                       required
                       minLength={6}
                     />
                   </div>
                 )}

                 <button 
                   type="submit" 
                   disabled={isAuthLoading}
                   className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-bold text-sm shadow-lg shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                   {isAuthLoading ? <RefreshCw className="animate-spin" size={16} /> : (authMode === 'login' ? 'Masuk Sekarang' : authMode === 'signup' ? 'Daftar & Kirim Email' : 'Kirim Link Reset')}
                 </button>
                 
                 <button 
                   type="button"
                   onClick={() => setAuthMode(null)}
                   className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl py-2.5 font-bold text-xs transition-all active:scale-[0.98] mt-1"
                 >
                   Kembali (Mode Tamu)
                 </button>
               </form>

               <div className="pt-2 flex flex-col items-center gap-2">
                 {authMode === 'login' ? (
                   <>
                     <button onClick={() => setAuthMode('signup')} className="text-xs text-blue-600 hover:underline font-medium">Belum punya akun? Daftar</button>
                     <button onClick={() => setAuthMode('forgot')} className="text-xs text-slate-400 hover:text-slate-600">Lupa password?</button>
                   </>
                 ) : (
                   <button onClick={() => setAuthMode('login')} className="text-xs text-blue-600 hover:underline font-medium">Sudah punya akun? Masuk</button>
                 )}
               </div>

               <div className="relative py-4">
                 <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                 <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-slate-300">Atau</span></div>
               </div>

               <button 
                 onClick={() => { setAuthMode(null); setIsGuest(true); }}
                 className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-3 font-bold text-sm shadow-lg mb-2 flex items-center justify-center gap-2 transition-all active:scale-95"
               >
                 Masuk Mode Tamu (Tanpa Login)
               </button>

               <button 
                 onClick={handleLogin}
                 className="w-full bg-white border-2 border-slate-100 hover:border-slate-200 text-slate-700 rounded-xl py-2.5 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
               >
                 <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-4 h-4" />
                 Lanjutkan dengan Google
               </button>
             </div>
           </div>
         </div>
        )}

      </div>
    </div>
  );
}

interface FilePreviewIconProps {
  file: FileDetail;
  user: User | null;
  className?: string;
  iconSize?: number;
}

export function FilePreviewIcon({ file, user, className, iconSize = 24 }: FilePreviewIconProps) {
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(file.name.split('.').pop()?.toLowerCase() || '');
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;

    if (file.isLocal) {
      setImgUrl(`/api/open/${encodeURIComponent(file.name)}`);
    } else if (file.isCloud && user) {
      const storageRef = ref(storage, `users/${user.uid}/${file.name}`);
      getDownloadURL(storageRef)
        .then((url) => {
          setImgUrl(`/api/proxy?url=${encodeURIComponent(url)}`);
        })
        .catch(() => {
          setImgUrl(`/api/open/${encodeURIComponent(file.name)}`);
        });
    } else {
      setImgUrl(`/api/open/${encodeURIComponent(file.name)}`);
    }
  }, [file.name, file.isLocal, file.isCloud, user, isImage]);

  if (isImage) {
    if (!imgUrl) {
      return (
        <div className={`flex items-center justify-center bg-slate-50 border border-slate-100/50 ${className}`}>
          <ImageIcon className="text-slate-300 animate-pulse" size={iconSize} />
        </div>
      );
    }
    return <img src={imgUrl} className={className} alt={file.name} referrerPolicy="no-referrer" loading="lazy" />;
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  let IconComponent = DefaultFileIcon;
  switch (ext) {
    case 'jpg': case 'jpeg': case 'png': case 'gif': IconComponent = ImageIcon; break;
    case 'mp4': case 'mov': case 'avi': IconComponent = Film; break;
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'css': case 'html': IconComponent = FileCode; break;
    case 'pdf': IconComponent = FileType; break;
    default: IconComponent = DefaultFileIcon;
  }
  return <IconComponent className="text-slate-400" size={iconSize} />;
}


