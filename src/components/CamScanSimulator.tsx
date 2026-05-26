import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, X, ArrowLeft, Check, RotateCw, Sparkles, Trash2, Edit, Type, 
  Download, Share2, FileText, Plus, Search, Image as ImageIcon, File, Globe,
  Folder, User, PenTool, Sliders, Lock, Settings, Layers, RefreshCw,
  HelpCircle, ChevronRight, CheckSquare, MinusCircle, Highlighter, MoreVertical
} from 'lucide-react';

import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface CamScanSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  files: any[]; // Changed from FileDetail[] to any[] for flexibility, but App.tsx passes the list
  fetchFiles: () => void;
  setToast: (msg: string) => void;
  autoScan?: boolean;
}

interface CamScanDoc {
  id: string;
  name: string;
  date: string;
  time: string;
  originalImage: string;
  processedImage: string;
  warpedImage: string;
  corners: Array<{ x: number; y: number }>;
  ocrWords: Array<{
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    bg: string;
    color: string;
    fontSize: number;
  }>;
  filter: 'none' | 'grayscale' | 'hitam_putih' | 'dokumen' | 'perbaiki_warna';
  rotation: number;
  brightness: number;
  contrast: number;
  pagesCount: number;
}

export default function CamScanSimulator({ 
  isOpen, 
  onClose, 
  user, 
  files, 
  fetchFiles, 
  setToast,
  autoScan = false
}: CamScanSimulatorProps) {
  
  if (!isOpen) return null;

  // Navigation states
  const [subPage, setSubPage] = useState<'main' | 'crop' | 'edit' | 'view' | 'tools'>('main');
  const [tabActive, setTabActive] = useState<'beranda' | 'file' | 'alat' | 'saya'>('beranda');
  
  // Auto-start camera if autoScan is requested
  useEffect(() => {
    if (isOpen && autoScan && !stream) {
      setCurrCapturedImage(null);
      setIsFullScreenCamera(true);
      startCamera();
    }
  }, [isOpen, autoScan]);
  
  // Document store
  const [docs, setDocs] = useState<CamScanDoc[]>(() => {
    try {
      const saved = localStorage.getItem('camscan_docs_v2');
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load camscan docs:", e);
    }
    return [];
  });
  
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  
  // Active document parameters (mirrored in state for live edits)
  const [currCapturedImage, setCurrCapturedImage] = useState<string | null>(null);
  const [currWarpedImage, setCurrWarpedImage] = useState<string | null>(null);
  const [currProcessedImage, setCurrProcessedImage] = useState<string | null>(null);
  const [currCorners, setCurrCorners] = useState<Array<{ x: number; y: number }>>([
    { x: 10, y: 15 },
    { x: 90, y: 15 },
    { x: 90, y: 85 },
    { x: 10, y: 85 }
  ]);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  
  // Dragging states
  const [activeMidEdge, setActiveMidEdge] = useState<number | null>(null); // 0: Top, 1: Right, 2: Bottom, 3: Left
  const dragStartCorners = useRef<Array<{ x: number; y: number }>>([]);
  const dragStartPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Filters & Tweak factors
  const [currFilter, setCurrFilter] = useState<'none' | 'grayscale' | 'hitam_putih' | 'dokumen' | 'perbaiki_warna'>('none');
  const [currRotation, setCurrRotation] = useState<number>(0);
  const [currBrightness, setCurrBrightness] = useState<number>(0);
  const [currContrast, setCurrContrast] = useState<number>(0);
  
  // Overlay OCR elements
  const [currWords, setCurrWords] = useState<CamScanDoc['ocrWords']>([]);
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  
  // Signature pad states
  const [isSignatureMode, setIsSignatureMode] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [sigColor, setSigColor] = useState('#000000');
  
  // Smart Eraser (Hapus Cerdas) states
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraserRadius, setEraserRadius] = useState(15);
  const eraserCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // General utility overlays
  const [searchQuery, setSearchQuery] = useState('');
  const [isCloudPickerOpen, setIsCloudPickerOpen] = useState(false);
  const [watermarkText, setWatermarkText] = useState('DRAFT');
  const [isWatermarkOpen, setIsWatermarkOpen] = useState(false);
  const [isPremiumBannerOpen, setIsPremiumBannerOpen] = useState(false);
  const [isPDFUtilitiesOpen, setIsPDFUtilitiesOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Camera handler
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isBackCamera, setIsBackCamera] = useState(true);
  const [isFullScreenCamera, setIsFullScreenCamera] = useState(false);

  // Initialize standard documents (matching user requirement/screenshots)
  useEffect(() => {
    const initMockData = async () => {
      // If we already have docs or we have already initialized once, don't do it again
      const wasInitialized = localStorage.getItem('camscan_init_done');
      if (wasInitialized || docs.length > 0) return;

      setLoading(true);
      
      const renderThumbnail = (type: 'invoice' | 'register' | 'doc' | 'child' | 'portrait' | 'avatar') => {
        const canvas = document.createElement('canvas');
        canvas.width = 450;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        
        ctx.fillStyle = type === 'invoice' || type === 'doc' ? '#fdfcf7' : (type === 'register' ? '#f2fbf4' : '#f1f5f9');
        ctx.fillRect(0, 0, 450, 600);
        
        if (type === 'invoice') {
          // Classic bill design matching user image
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(30, 110, 390, 395);
          ctx.moveTo(30, 140); ctx.lineTo(420, 140);
          ctx.moveTo(100, 110); ctx.lineTo(100, 505);
          ctx.moveTo(290, 110); ctx.lineTo(290, 505);
          ctx.moveTo(360, 110); ctx.lineTo(360, 505);
          ctx.stroke();
          
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 15px Courier New, monospace';
          ctx.fillText('NOTA NO. ....................... 555', 35, 45);
          ctx.font = '10px sans-serif';
          ctx.fillText('Tanggal : 25/05/2026', 35, 70);
          ctx.fillText('Untuk Tuan / Toko : Jk Kucing', 35, 88);
          
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText('Qty', 50, 128);
          ctx.fillText('NAMA BARANG', 135, 128);
          ctx.fillText('Harga', 305, 128);
          ctx.fillText('Jumlah', 375, 128);
          
          ctx.fillStyle = '#1d4ed8'; // blue pen ink
          ctx.font = 'bold 13px Courier New';
          ctx.fillText('49', 55, 165);
          ctx.fillText('Foto Ijazah', 115, 165);
          ctx.fillText('490.000', 368, 165);
          
          ctx.fillStyle = '#1e293b';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('Tanda terima', 50, 480);
          ctx.fillText('Jumlah Rp. 490.000', 275, 484);
          
          // Red round rubber stamp
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(135, 475, 23, 0, Math.PI * 2);
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
          for (let val = 110; val < 520; val += 30) {
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
          // Typical official report
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
            ctx.fillText((idx + 1) + ". " + r, 45, 120 + idx * 40);
          });
          
          ctx.fillStyle = 'rgba(253, 224, 71, 0.4)';
          ctx.fillRect(43, 112, 330, 11);
          ctx.fillRect(43, 192, 210, 11);
        } else {
          // Blue badge school portrait
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, 450, 600);
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(225, 230, 80, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('PAS FOTO SISWA', 158, 480);
        }
        
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.font = '8px monospace';
        ctx.fillText('Simulated CamScanner Image Stream', 20, 580);
        
        return canvas.toDataURL('image/jpeg', 0.9);
      };

      const invoiceImg = renderThumbnail('invoice');
      const registerImg = renderThumbnail('register');
      const docImg = renderThumbnail('doc');
      const boyImg = renderThumbnail('child');
      const badgeImg = renderThumbnail('portrait');
      const otherImg = renderThumbnail('avatar');

      const initialDocs: CamScanDoc[] = [
        {
          id: 'doc-invoice',
          name: 'CamScanner 25-05-2026 18.31',
          date: '25/05/2026',
          time: '18:31',
          originalImage: invoiceImg,
          processedImage: invoiceImg,
          warpedImage: invoiceImg,
          corners: [{ x: 10, y: 15 }, { x: 90, y: 15 }, { x: 90, y: 85 }, { x: 10, y: 85 }],
          ocrWords: [
            { text: "Foto Ijazah", x: 26, y: 27, w: 25, h: 4, bg: "transparent", color: "#1d4ed8", fontSize: 13 },
            { text: "490.000", x: 74, y: 27, w: 15, h: 4, bg: "transparent", color: "#1d4ed8", fontSize: 13 }
          ],
          filter: 'none',
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
          corners: [{ x: 5, y: 5 }, { x: 95, y: 5 }, { x: 95, y: 95 }, { x: 5, y: 95 }],
          ocrWords: [
            { text: "MARIFIN JOMBANG", x: 15, y: 19.5, w: 30, h: 3, bg: "transparent", color: "#111827", fontSize: 11 }
          ],
          filter: 'none',
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
          corners: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }],
          ocrWords: [],
          filter: 'none',
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
          corners: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }],
          ocrWords: [],
          filter: 'none',
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
          corners: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }],
          ocrWords: [],
          filter: 'none',
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
          originalImage: otherImg,
          processedImage: otherImg,
          warpedImage: otherImg,
          corners: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }],
          ocrWords: [],
          filter: 'none',
          rotation: 0,
          brightness: 0,
          contrast: 0,
          pagesCount: 1
        }
      ];
      setDocs(initialDocs);
      localStorage.setItem('camscan_docs_v2', JSON.stringify(initialDocs));
      localStorage.setItem('camscan_init_done', 'true');
      setLoading(false);
    };

    initMockData();
  }, []); 

  // Sync docs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('camscan_docs_v2', JSON.stringify(docs));
    } catch (e) {
      console.error("Storage limit possibly exceeded:", e);
      setToast("Peringatan: Memori penyimpanan penuh, berkas mungkin tidak tersimpan.");
    }
  }, [docs]);

  // Handle Camera Access
  const startCamera = async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      const constraints = {
        video: {
          facingMode: isBackCamera ? "environment" : "user",
          width: { ideal: 1024 },
          height: { ideal: 1024 }
        }
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setToast("Kamera belakang berhasil dicanangkan!");
    } catch (err) {
      console.error("Camera constraint fallback:", err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(fallbackStream);
        setToast("Kamera dicanangkan!");
      } catch (failed) {
        setToast("Gagal mengakses kamera. Silakan pilih alternatif Impor dari Galeri HP.");
      }
    }
  };

  useEffect(() => {
    if (isOpen && subPage === 'main' && !currCapturedImage) {
      // Auto trigger camera when clicking floating camera FAB
    }
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen, subPage, isBackCamera]);

  // Unified Auto-Processing Workflow (Deskew + Enhance)
  const triggerAutoProcessing = (imageData: string) => {
    setLoading(true);
    setProgress(5);
    setToast("Sedang meluruskan & mengoreksi dokumen otomatis...");
    
    setCurrCapturedImage(imageData);
    setCurrWarpedImage(null);
    setCurrProcessedImage(null);
    // Standard document corners for auto alignment
    const autoCorners = [
      { x: 5, y: 5 },
      { x: 95, y: 5 },
      { x: 95, y: 95 },
      { x: 5, y: 95 }
    ];
    setCurrCorners(autoCorners);

    // Give state a moment to settle then execute warp
    setTimeout(() => {
      executeBilinearAlign(true, autoCorners, imageData); // PASS IMAGE DATA DIRECTLY FOR CONSISTENCY
    }, 400); 
  };

  const capturePhoto = () => {
    const video = document.getElementById("mobile-video-el") as HTMLVideoElement;
    if (!video) {
        // Try fallback selector if it was rendered in full screen
        const videoFS = document.querySelector('video[autoplay]') as HTMLVideoElement;
        if (!videoFS) {
            setToast("Elemen video tidak ditemukan!");
            return;
        }
    }
    const targetVideo = (document.getElementById("mobile-video-el") || document.querySelector('video[autoplay]')) as HTMLVideoElement;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = targetVideo.videoWidth || 640;
      canvas.height = targetVideo.videoHeight || 640;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      // Handle mirroring in the capture if it was mirrored in UI
      if (!isBackCamera) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(targetVideo, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setStream(null);
      }

      setIsFullScreenCamera(false);
      triggerAutoProcessing(dataUrl);
    } catch (e: any) {
      setToast("Gagal memotret gambar: " + e.message);
    }
  };

  // Local file importer
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      triggerAutoProcessing(result);
    };
    reader.readAsDataURL(file);
  };

  // Cloud file importer helper
  const handleImportFromCloud = async (fileName: string) => {
    setIsCloudPickerOpen(false);
    setLoading(true);
    setToast(`Memuat ${fileName} dari Cloud...`);
    
    try {
      const response = await fetch(`/api/open/${encodeURIComponent(fileName)}`);
      if (!response.ok) throw new Error("Gagal mengunduh file cloud");
      
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        triggerAutoProcessing(result);
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      setToast("Gagal mematukan dari Cloud: " + err.message);
      setLoading(false);
    }
  };

  // Rotations under Crop (Screenshot 5 actions: Kiri / Kanan)
  const rotateSourceImage = (clockwise: boolean) => {
    if (!currCapturedImage) return;
    setLoading(true);
    setProgress(10);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setLoading(false);
        setProgress(0);
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((clockwise ? 90 : -90) * Math.PI / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      
      const rotatedUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCurrCapturedImage(rotatedUrl);
      setToast(clockwise ? "Diputar 90° Kanan" : "Diputar 90° Kiri");
      setLoading(false);
      setProgress(0);
    };
    img.onerror = () => {
      setToast("Gagal memproses rotasi gambar.");
      setLoading(false);
      setProgress(0);
    };
    img.src = currCapturedImage || '';
  };

  const handleDeleteCloudFile = async (e: React.MouseEvent, fileName: string) => {
    e.stopPropagation();
    setIsDeleting(fileName);
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState<{old: string, new: string} | null>(null);

  const handleRenameCloudFile = async () => {
    if (!isRenaming) return;
    const { old: oldName, new: newName } = isRenaming;
    if (!newName || newName === oldName.replace(/\.[^/.]+$/, "")) {
      setIsRenaming(null);
      return;
    }

    const ext = oldName.includes('.') ? oldName.split('.').pop() : '';
    let finalName = newName;
    if (ext && !finalName.toLowerCase().endsWith('.' + ext.toLowerCase())) {
      finalName = finalName + '.' + ext;
    }
    
    if (finalName === oldName) {
      setIsRenaming(null);
      return;
    }

    setLoading(true);
    setToast(`Mengubah nama ${oldName}...`);
    try {
      const response = await fetch('/api/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName: finalName, uid: user?.uid })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengubah nama");
      }
      
      setToast("Nama file berhasil diperbarui.");
      setIsRenaming(null);
      setTimeout(() => fetchFiles(), 500);
    } catch (err: any) {
      setToast("Gagal rename: " + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const confirmDeleteFile = async () => {
    if (!isDeleting) return;
    const fileName = isDeleting;
    
    setLoading(true);
    setToast(`Menghapus ${fileName}...`);
    try {
      // 1. Delete from Server
      const url = `/api/delete/${encodeURIComponent(fileName)}` + (user?.uid ? `?uid=${user.uid}` : '');
      const response = await fetch(url, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Gagal menghapus file");
      }

      // 2. Delete from Firestore if tracked there
      const fileDetail = files.find(f => f.name === fileName);
      if (fileDetail?.id) {
          try {
              await deleteDoc(doc(db, 'files', fileDetail.id));
          } catch(e) {
              console.error("Failed to delete Firestore record:", e);
          }
      }
      
      setToast("File berhasil dihapus.");
      setIsDeleting(null);
      setTimeout(() => fetchFiles(), 500);
    } catch (err: any) {
      setToast("Gagal menghapus: " + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleExportExistingFile = async (fileName: string) => {
    setLoading(true);
    setToast(`Mengekspor ${fileName}...`);
    try {
      // 1. Fetch the file blob first
      const res = await fetch(`/api/open/${encodeURIComponent(fileName)}`);
      if (!res.ok) throw new Error("Gagal mengambil file");
      const blob = await res.blob();
      
      // 2. Convert blob to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        // 3. Trigger conversion to docx
        const timestamp = Date.now();
        const response = await fetch("/api/camscan/save-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            filename: `${fileName.replace(/\.[^/.]+$/, "")}_Export_${timestamp}.docx`,
            textBlocks: [{ text: "Ekspor File Awan" }],
            uid: user?.uid
          })
        });

        if (response.ok) {
          const data = await response.json();
          window.location.href = `/api/open/${encodeURIComponent(data.name)}`;
          setToast("File Word berhasil diunduh.");
        } else {
          throw new Error("Gagal konversi docx");
        }
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      setToast("Ekspor gagal: " + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // Bilinear Deskew and Flatten Paper Document math
  const executeBilinearAlign = (isAuto: boolean = false, overrideCorners?: {x: number, y: number}[], overrideImage?: string) => {
    const imageToUse = overrideImage || currCapturedImage;
    if (!imageToUse) {
      setLoading(false);
      setProgress(0);
      return;
    }
    setLoading(true);
    setProgress(5);
    if (!isAuto) setToast("Meluruskan miring dokumen...");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      try {
        if (img.width === 0 || img.height === 0) {
          throw new Error("Gambar tidak memiliki dimensi yang valid.");
        }
        setProgress(15);

        const sw = img.width;
        const sh = img.height;

        const corners = overrideCorners || currCorners;
        if (!corners || corners.length < 4) {
          throw new Error("Koordinat sudut tidak valid.");
        }

        const x0 = (corners[0].x / 100) * sw;
        const y0 = (corners[0].y / 100) * sh;
        const x1 = (corners[1].x / 100) * sw;
        const y1 = (corners[1].y / 100) * sh;
        const x2 = (corners[2].x / 100) * sw;
        const y2 = (corners[2].y / 100) * sh;
        const x3 = (corners[3].x / 100) * sw;
        const y3 = (corners[3].y / 100) * sh;

        // Calculate aspect ratio
        const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
        const w1 = dist(x0, y0, x1, y1);
        const w2 = dist(x3, y3, x2, y2);
        const h1 = dist(x0, y0, x3, y3);
        const h2 = dist(x1, y1, x2, y2);
        const avgW = (w1 + w2) / 2;
        const avgH = (h1 + h2) / 2;
        const ratio = avgW / avgH;

        // Maintain doc aspect ratio (base height 850)
        const outHeight = 850;
        const outWidth = Math.round(850 * ratio);

        const canvas = document.createElement("canvas");
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Gagal menginisialisasi canvas context.");

        const helperCanvas = document.createElement("canvas");
        helperCanvas.width = sw;
        helperCanvas.height = sh;
        const helperCtx = helperCanvas.getContext("2d");
        if (!helperCtx) throw new Error("Gagal menginisialisasi helper context.");
        
        helperCtx.drawImage(img, 0, 0);
        const sData = helperCtx.getImageData(0, 0, sw, sh).data;
        const dData = ctx.createImageData(outWidth, outHeight);

        const chunkSize = 30;
        for (let v = 0; v < outHeight; v++) {
          if (v % chunkSize === 0) {
            setProgress(15 + Math.round((v / outHeight) * 80));
            await new Promise(r => setTimeout(r, 0));
          }
          const q = v / (outHeight - 1);
          const omq = 1 - q;
          for (let u = 0; u < outWidth; u++) {
            const p = u / (outWidth - 1);
            const omp = 1 - p;

            const sx = omp * omq * x0 + p * omq * x1 + p * q * x2 + omp * q * x3;
            const sy = omp * omq * y0 + p * omq * y1 + p * q * y2 + omp * q * y3;

            const isx = Math.max(0, Math.min(sw - 1, Math.round(sx)));
            const isy = Math.max(0, Math.min(sh - 1, Math.round(sy)));

            const srcIdx = (isy * sw + isx) * 4;
            const destIdx = (v * outWidth + u) * 4;

            dData.data[destIdx] = sData[srcIdx];
            dData.data[destIdx + 1] = sData[srcIdx + 1];
            dData.data[destIdx + 2] = sData[srcIdx + 2];
            dData.data[destIdx + 3] = sData[srcIdx + 3];
          }
        }

        setProgress(98);
        ctx.putImageData(dData, 0, 0);
        const alignedResult = canvas.toDataURL("image/jpeg", 0.95);
        setCurrWarpedImage(alignedResult);
        setCurrProcessedImage(alignedResult);
        
        setCurrFilter(isAuto ? 'dokumen' : 'none');
        setCurrRotation(0);
        setCurrBrightness(0);
        setCurrContrast(0);
        setCurrWords([]);
        
        setSubPage('edit');
        if (isAuto) {
          setToast("Dokumen otomatis diluruskan & dipertajam!");
        } else {
          setToast("Dokumen diluruskan & dide-skew!");
        }
        setProgress(100);
      } catch (err: any) {
        console.error(err);
        setToast("Gagal meluruskan bagian dokumen: " + err.message);
      } finally {
        setTimeout(() => {
          setLoading(false);
          setProgress(0);
        }, 300);
      }
    };
    img.onerror = () => {
      setToast("Gagal memuat gambar untuk pemrosesan.");
      setLoading(false);
      setProgress(0);
    };
    img.crossOrigin = "anonymous";
    img.src = imageToUse;
  };

  // Live image filtering & parameters processor (brightness contrast)
  const applyImageProcessors = () => {
    if (!currWarpedImage) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const radStr = (currRotation * Math.PI) / 180;
        const sin = Math.abs(Math.sin(radStr));
        const cos = Math.abs(Math.cos(radStr));
        const w = img.width;
        const h = img.height;
        
        const rW = Math.round(w * cos + h * sin);
        const rH = Math.round(w * sin + h * cos);
        
        const canvas = document.createElement('canvas');
        canvas.width = rW;
        canvas.height = rH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.translate(rW / 2, rH / 2);
        ctx.rotate(radStr);
        ctx.drawImage(img, -w / 2, -h / 2);
        
        const imgData = ctx.getImageData(0, 0, rW, rH);
        const px = imgData.data;
        const contrastFactor = (259 * (currContrast + 255)) / (255 * (259 - currContrast));
        
        for (let i = 0; i < px.length; i += 4) {
          let r = px[i];
          let g = px[i + 1];
          let b = px[i + 2];
          
          if (currBrightness !== 0) {
            r = Math.max(0, Math.min(255, r + currBrightness));
            g = Math.max(0, Math.min(255, g + currBrightness));
            b = Math.max(0, Math.min(255, b + currBrightness));
          }
          if (currContrast !== 0) {
            r = Math.max(0, Math.min(255, contrastFactor * (r - 128) + 128));
            g = Math.max(0, Math.min(255, contrastFactor * (g - 128) + 128));
            b = Math.max(0, Math.min(255, contrastFactor * (b - 128) + 128));
          }
          
          // Filters
          if (currFilter === 'grayscale') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = g = b = gray;
          } else if (currFilter === 'hitam_putih') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = g = b = gray > 125 ? 255 : 0;
          } else if (currFilter === 'dokumen') {
            // Document magic: heavy contrast + background bleaching
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            if (gray > 130) {
              // Bleach background to white
              r = Math.min(255, r * 1.5 + 20);
              g = Math.min(255, g * 1.5 + 20);
              b = Math.min(255, b * 1.5 + 20);
            } else {
              // Sharpen black ink
              r = Math.max(0, r * 0.5);
              g = Math.max(0, g * 0.5);
              b = Math.max(0, b * 0.5);
            }
            // Additional overall contrast boost
            const docContrast = 40;
            const factor = (259 * (docContrast + 255)) / (255 * (259 - docContrast));
            r = Math.max(0, Math.min(255, factor * (r - 128) + 128));
            g = Math.max(0, Math.min(255, factor * (g - 128) + 128));
            b = Math.max(0, Math.min(255, factor * (b - 128) + 128));
          } else if (currFilter === 'perbaiki_warna') {
            r = Math.max(0, Math.min(255, r * 1.15 + 10));
            g = Math.max(0, Math.min(255, g * 1.1 + 8));
            b = Math.max(0, Math.min(255, b * 1.25 + 15));
          }
          
          px[i] = r;
          px[i + 1] = g;
          px[i + 2] = b;
        }
        
        ctx.putImageData(imgData, 0, 0);
        setCurrProcessedImage(canvas.toDataURL("image/jpeg", 0.95));
      } catch (err) {
        console.error(err);
      }
    };
    img.crossOrigin = "anonymous";
    img.src = currWarpedImage;
  };

  useEffect(() => {
    if (currWarpedImage) {
      applyImageProcessors();
    }
  }, [currFilter, currRotation, currBrightness, currContrast, currWarpedImage]);

  // Handle click on canvas bounding box to add customized text manually
  const clickAddTextWord = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newW = {
      text: "Isi Teks Baru",
      x: Math.max(0, Math.min(90, x - 10)),
      y: Math.max(0, Math.min(95, y - 2)),
      w: 20,
      h: 5,
      bg: "#ffffff",
      color: "#000000",
      fontSize: 12
    };

    setCurrWords([...currWords, newW]);
    setSelectedWordIdx(currWords.length);
  };

  const deleteWordBox = (idx: number) => {
    setCurrWords(currWords.filter((_, i) => i !== idx));
    setSelectedWordIdx(null);
  };

  const updateWordText = (idx: number, newTxt: string) => {
    const nextWords = [...currWords];
    nextWords[idx].text = newTxt;
    setCurrWords(nextWords);
  };

  const updateWordParam = (idx: number, field: string, value: any) => {
    const nextWords = [...currWords];
    nextWords[idx] = {
      ...nextWords[idx],
      [field]: value
    };
    setCurrWords(nextWords);
  };

  // Drag handles for the four quadrilateral corner nodes in Crop page page
  const handleCornerDrag = (clientX: number, clientY: number, containerRef: HTMLDivElement) => {
    if (activeCorner === null) return;
    const rect = containerRef.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    
    const nextCorners = [...currCorners];
    nextCorners[activeCorner] = {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y))
    };
    setCurrCorners(nextCorners);
  };

  // Interactive dragger supporting middle capsule indicators (as in Image 5)
  // Shifts the entire respective boundary line side nicely together
  const handleMidEdgeDragStart = (e: React.MouseEvent, edgeIndex: number, containerRef: HTMLDivElement) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    setActiveMidEdge(edgeIndex);
    dragStartCorners.current = [...currCorners];
    dragStartPoint.current = {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    };
  };

  const handlePointerMoveAllDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget) return;
    
    // Corner drag check
    if (activeCorner !== null) {
      handleCornerDrag(e.clientX, e.clientY, e.currentTarget);
      return;
    }

    // Mid edge capsule drag check
    if (activeMidEdge !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const currX = ((e.clientX - rect.left) / rect.width) * 100;
      const currY = ((e.clientY - rect.top) / rect.height) * 100;
      
      const dx = currX - dragStartPoint.current.x;
      const dy = currY - dragStartPoint.current.y;
      
      const nextCorners = [...dragStartCorners.current];
      
      if (activeMidEdge === 0) {
        // TOP: shifts corners 0 & 1
        nextCorners[0] = { x: Math.max(0, Math.min(100, nextCorners[0].x + dx)), y: Math.max(0, Math.min(100, nextCorners[0].y + dy)) };
        nextCorners[1] = { x: Math.max(0, Math.min(100, nextCorners[1].x + dx)), y: Math.max(0, Math.min(100, nextCorners[1].y + dy)) };
      } else if (activeMidEdge === 1) {
        // RIGHT: shifts corners 1 & 2
        nextCorners[1] = { x: Math.max(0, Math.min(100, nextCorners[1].x + dx)), y: Math.max(0, Math.min(100, nextCorners[1].y + dy)) };
        nextCorners[2] = { x: Math.max(0, Math.min(100, nextCorners[2].x + dx)), y: Math.max(0, Math.min(100, nextCorners[2].y + dy)) };
      } else if (activeMidEdge === 2) {
        // BOTTOM: shifts corners 2 & 3
        nextCorners[2] = { x: Math.max(0, Math.min(100, nextCorners[2].x + dx)), y: Math.max(0, Math.min(100, nextCorners[2].y + dy)) };
        nextCorners[3] = { x: Math.max(0, Math.min(100, nextCorners[3].x + dx)), y: Math.max(0, Math.min(100, nextCorners[3].y + dy)) };
      } else if (activeMidEdge === 3) {
        // LEFT: shifts corners 3 & 0
        nextCorners[3] = { x: Math.max(0, Math.min(100, nextCorners[3].x + dx)), y: Math.max(0, Math.min(100, nextCorners[3].y + dy)) };
        nextCorners[0] = { x: Math.max(0, Math.min(100, nextCorners[0].x + dx)), y: Math.max(0, Math.min(100, nextCorners[0].y + dy)) };
      }
      
      setCurrCorners(nextCorners);
    }
  };

  const stopAllPointerDrag = () => {
    setActiveCorner(null);
    setActiveMidEdge(null);
  };

  // Midline handle display calculation helpers (capsule handles shown in Image 5)
  const getMidPoint = (c1: { x: number; y: number }, c2: { x: number; y: number }) => {
    return {
      x: (c1.x + c2.x) / 2,
      y: (c1.y + c2.y) / 2
    };
  };

  const midTop = getMidPoint(currCorners[0], currCorners[1]);
  const midRight = getMidPoint(currCorners[1], currCorners[2]);
  const midBottom = getMidPoint(currCorners[2], currCorners[3]);
  const midLeft = getMidPoint(currCorners[3], currCorners[0]);

  // Saves completed scanner session & commits to standard doc lists
  const saveProcessedDocSessionFile = () => {
    if (!currCapturedImage) return;

    // Apply watermark on canvas if text is entered
    setLoading(true);
    setToast("Menyimpan perubahan dokumen...");
    
    setTimeout(() => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':');
      
      const docName = `CamScanner ${dateStr} ${timeStr}`;
      const uniqueId = `doc-${Date.now()}`;
      
      const newDocItem: CamScanDoc = {
        id: activeDocId || uniqueId,
        name: activeDocId ? (docs.find(d => d.id === activeDocId)?.name || docName) : docName,
        date: dateStr,
        time: timeStr,
        originalImage: currCapturedImage,
        processedImage: currProcessedImage || currCapturedImage,
        warpedImage: currWarpedImage || '',
        corners: currCorners,
        ocrWords: currWords,
        filter: currFilter,
        rotation: currRotation,
        brightness: currBrightness,
        contrast: currContrast,
        pagesCount: 1
      };

      if (activeDocId) {
        setDocs(prev => prev.map(item => item.id === activeDocId ? newDocItem : item));
      } else {
        setDocs(prev => [newDocItem, ...prev]);
        setActiveDocId(uniqueId);
      }
      
      setLoading(false);
      setSubPage('view');
      setToast("Dokumen berhasil diproses & disimpan!");
    }, 450);
  };

  // Compile final composite canvas drawing words + overlays on image
  const constructFinalCanvasImage = (): Promise<HTMLCanvasElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => reject("Gagal memuat citra akhir.");
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject('No canvas context');
          return;
        }
        ctx.drawImage(img, 0, 0);

        // Apply any translucent diagonal watermark text if configured
        if (isWatermarkOpen && watermarkText) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(-45 * Math.PI / 180);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.22)'; // semi-transparent red watermark
          ctx.font = 'bold 36px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(watermarkText, 0, 0);
          ctx.restore();
        }

        // Draw words text block modifications
        currWords.forEach(w => {
          const rx = (w.x / 100) * canvas.width;
          const ry = (w.y / 100) * canvas.height;
          const rw = (w.w / 100) * canvas.width;
          const rh = (w.h / 100) * canvas.height;

          if (w.bg && w.bg !== 'transparent') {
            ctx.fillStyle = w.bg;
            ctx.fillRect(rx, ry, rw, rh);
          }
          ctx.fillStyle = w.color || '#000000';
          const drawSize = Math.floor((w.fontSize / 100) * canvas.height);
          ctx.font = `bold ${drawSize}px Arial, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText(w.text, rx + 4, ry + rh / 2, rw - 8);
        });

        resolve(canvas);
      };
      img.src = currProcessedImage || currCapturedImage || '';
    });
  };

  // Export to local gallery (Downloads as beautiful clean .png)
  const saveToCloud = async () => {
    try {
      setLoading(true);
      setProgress(20);
      const canvas = await constructFinalCanvasImage();
      const base64 = canvas.toDataURL('image/png');
      const timestamp = Date.now();
      const filename = `Scan_Cloud_${timestamp}.png`;
      
      setProgress(50);
      const response = await fetch("/api/camscan/save-cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          filename: filename,
          uid: user ? user.uid : undefined
        })
      });

      setProgress(90);
      if (response.ok) {
        setToast(`Berhasil disimpan ke Cloud: ${filename}`);
        fetchFiles();
        setIsShareSheetOpen(false);
      } else {
        throw new Error("Gagal menyimpan ke Cloud!");
      }
    } catch (err: any) {
      setToast("Gagal simpan cloud: " + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const downloadToLocalGallery = async () => {
    try {
      setLoading(true);
      const canvas = await constructFinalCanvasImage();
      const base64 = canvas.toDataURL('image/png');
      
      const link = document.createElement('a');
      link.download = `Gallery_Scan_${Date.now()}.png`;
      link.href = base64;
      link.click();
      
      setToast("Gambar tersimpan ke Galeri HP dan diunduh lokal!");
    } catch (e: any) {
      setToast("Gagal mengunduh gambar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Integrated Online AI Word Export .docx converter API request
  const convertOfflineOcrToWordDocxFile = async () => {
    try {
      setLoading(true);
      setProgress(10);
      setToast("Mempersiapkan konversi hasil suntingan ke Word...");
      
      const canvas = await constructFinalCanvasImage();
      const base64 = canvas.toDataURL('image/png');
      const timestamp = Date.now();
      
      setProgress(30);
      const ocrBlocks = currWords.length > 0 ? currWords.map(w => ({ text: w.text })) : [{ text: 'Dokumen Kosong' }];
      
      const response = await fetch("/api/camscan/save-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          filename: `CamScan_${timestamp}.docx`,
          textBlocks: ocrBlocks,
          uid: user ? user.uid : undefined
        })
      });

      setProgress(80);
      if (response.ok) {
        setToast("Dokumen .docx Word berhasil tersimpan di Cloud Storage!");
        fetchFiles();

        const data = await response.json();
        const urlLink = `/api/open/${encodeURIComponent(data.name)}`;
        const downloader = document.createElement('a');
        downloader.download = data.name;
        downloader.href = urlLink;
        downloader.click();
        setProgress(100);
      } else {
        throw new Error("Gagal mengekspor file dari server!");
      }
    } catch (err: any) {
      setToast("Ekspor gagal: " + err.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // Online AI OCR word recognition trigger
  const triggerOnlineGeminiOcrParser = async () => {
    if (!currProcessedImage) return;
    setLoading(true);
    setProgress(5);
    setToast("Menghubungi AI Gemini untuk mendeteksi koordinat huruf...");
    
    try {
      setProgress(20);
      const res = await fetch("/api/camscan/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: currProcessedImage })
      });
      
      setProgress(60);
      if (!res.ok) {
        throw new Error("Server OCR mengembalikan error.");
      }
      
      const data = await res.json();
      setProgress(85);
      if (data && data.words && Array.isArray(data.words)) {
        // Format coordinates
        const formatted = data.words.map((item: any) => ({
          text: item.text || '',
          x: item.x !== undefined ? item.x : 20,
          y: item.y !== undefined ? item.y : 30,
          w: item.w !== undefined ? item.w : 15,
          h: item.h !== undefined ? item.h : 4,
          bg: '#ffffff',
          color: '#000000',
          fontSize: 10
        }));
        setCurrWords(formatted);
        setProgress(100);
        setToast(`AI Berhasil memindai ${formatted.length} kata tulisan!`);
      } else {
        setToast("Format OCR tidak valid atau tidak ada teks terdeteksi.");
      }
    } catch (error: any) {
      setToast("Gagal melakukan OCR: " + error.message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  // Signature pad drawing listeners (with touch pointer events safety)
  const paintSignatureLine = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingSignature) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = sigColor;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const startSignatureDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawingSignature(true);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const applySignatureIntoDocumentPage = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    setLoading(true);
    const inkBase64 = canvas.toDataURL('image/png'); // transparent background signature
    
    // Burn onto document canvas right now at bottom right
    const imgDoc = new Image();
    imgDoc.onload = () => {
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = imgDoc.width;
      finalCanvas.height = imgDoc.height;
      const ctx = finalCanvas.getContext('2d');
      if (!ctx) {
        setLoading(false);
        return;
      }
      ctx.drawImage(imgDoc, 0, 0);
      
      const sigImg = new Image();
      sigImg.onload = () => {
        // Draw in signature space
        ctx.drawImage(sigImg, finalCanvas.width * 0.65, finalCanvas.height * 0.75, finalCanvas.width * 0.28, finalCanvas.height * 0.18);
        setCurrProcessedImage(finalCanvas.toDataURL('image/jpeg', 0.95));
        setCurrWarpedImage(finalCanvas.toDataURL('image/jpeg', 0.95));
        setIsSignatureMode(false);
        setLoading(false);
        setToast("Tanda tangan pena Anda berhasil digabung ke dokumen!");
      };
      sigImg.src = inkBase64;
    };
    imgDoc.src = currProcessedImage || currCapturedImage || '';
  };

  // Smart Brush Eraser brush handler (cleans areas on drag)
  const playSmartEraserLine = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isErasing) return;
    const canvas = eraserCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineWidth = eraserRadius;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff'; // White paint over paper background
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const startSmartEraserPaint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = eraserCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsErasing(true);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const saveSmartEraserCanvas = () => {
    const canvas = eraserCanvasRef.current;
    if (!canvas) return;
    setLoading(true);
    const erasedBase64 = canvas.toDataURL('image/jpeg', 0.95);
    setCurrProcessedImage(erasedBase64);
    setCurrWarpedImage(erasedBase64);
    setIsEraserMode(false);
    setLoading(false);
    setToast("Penghapusan cerdas berhasil diterapkan!");
  };

  // Direct mock doc opener from Main "Terkini" row
  const openMockDocumentToView = (doc: CamScanDoc) => {
    setActiveDocId(doc.id);
    setCurrCapturedImage(doc.originalImage);
    setCurrWarpedImage(doc.processedImage);
    setCurrProcessedImage(doc.processedImage);
    setCurrCorners(doc.corners);
    setCurrWords(doc.ocrWords);
    setCurrFilter(doc.filter);
    setCurrRotation(doc.rotation);
    setCurrBrightness(doc.brightness);
    setCurrContrast(doc.contrast);
    setSubPage('view');
  };

  // Helper filter search docs
  const filteredDocs = docs.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex justify-center items-center z-50 overflow-hidden font-sans select-none antialiased text-slate-100">
      
      {/* 1. Side Information Panel (Left desk sidebar) */}
      <div className="hidden lg:flex flex-col max-w-sm p-6 text-slate-300 gap-4 mr-6">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 text-white p-2.5 rounded-xl">
            <Camera size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">CamScan Mobile Simulator</h2>
            <span className="text-xs text-emerald-400 font-semibold tracking-wider uppercase font-mono">Premium Elite License</span>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          Simulasi aplikasi CamScanner mobile lengkap dengan menu, edit, potong miring (bilinear warp), watermark, tanda tangan, AI OCR Gemini parser, dan tombol ekspor.
        </p>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs space-y-2 mt-2 shadow-inner">
          <h3 className="font-semibold text-emerald-400">💡 Tip Penggunaan:</h3>
          <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-400 leading-relaxed">
            <li>Klik <strong className="text-slate-200">Kamera FAB</strong> atau <strong className="text-slate-200">Scan</strong> untuk memotret kertas baru.</li>
            <li>Gunakan <strong className="text-slate-200">Kartu ID</strong> atau <strong className="text-slate-200">Ekstrak Teks</strong> untuk utilitas bertenaga AI.</li>
            <li>Tap dokumen <strong className="text-slate-200">Terkini</strong> di daftar untuk meninjau atau mengedit file tersebut.</li>
          </ul>
        </div>
        <button
          onClick={onClose}
          className="p-3 bg-red-950/40 hover:bg-red-900/40 border border-red-800/60 rounded-xl text-red-100 font-semibold text-xs transition-all flex items-center justify-center gap-2 mt-4 active:scale-95"
        >
          <X size={14} /> Tutup & Keluar Simulator
        </button>
      </div>

      {/* 2. THE SMARTPHONE DEVICE HANDSET SIMULATOR CONTAINER */}
      <div className="relative w-full h-full max-w-md max-h-[92vh] md:rounded-[40px] md:border-[12px] md:border-slate-800 bg-slate-900 md:shadow-[0_0_80px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
        
        {/* Phone Notch & Top Status indicators bar */}
        <div className="bg-slate-950 px-4 pt-3 pb-2 flex items-center justify-between text-xs text-slate-300 font-semibold tracking-wider shrink-0 select-none z-10 relative">
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-white relative z-20"
            title="Tutup App"
          >
            <X size={16} />
          </button>
          
          {/* Centered Clock and Date merged on one line */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 whitespace-nowrap z-10">
            <span className="text-[10px] font-bold text-slate-100">
              {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':')}
            </span>
            <span className="text-[8px] text-slate-400 font-medium uppercase tracking-tight">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          {/* Hardware notch mockup */}
          <div className="hidden md:block w-32 h-4.5 bg-black rounded-b-xl absolute left-1/2 -translate-x-1/2 top-0 z-50 pointer-events-none"></div>
          
          <div className="w-6"></div> {/* Empty right side for balance */}
        </div>

        {/* Cloud Picker Modal overlay inside phone context */}
        {isCloudPickerOpen && (
          <div className="absolute inset-0 bg-slate-950/95 z-[120] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-4 py-4 border-b border-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-600 p-1.5 rounded-lg">
                  <RefreshCw size={14} className="text-white" />
                </div>
                <h4 className="text-xs font-bold text-white uppercase tracking-tight">Pilih Berkas Cloud</h4>
              </div>
              <button 
                onClick={() => setIsCloudPickerOpen(false)}
                className="p-1 px-2.5 bg-slate-900 text-slate-400 rounded-lg hover:text-white"
              >
                Batal
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(files || []).filter(f => ['jpg', 'jpeg', 'png', 'webp'].includes(f.name.split('.').pop()?.toLowerCase() || '')).length > 0 ? (
                (files || []).filter(f => ['jpg', 'jpeg', 'png', 'webp'].includes(f.name.split('.').pop()?.toLowerCase() || '')).map(file => (
                  <button 
                    key={file.name}
                    onClick={() => handleImportFromCloud(file.name)}
                    className="w-full bg-slate-900/60 p-3 rounded-xl border border-slate-900 flex items-center gap-3 hover:border-indigo-500/50 hover:bg-slate-900 transition-all text-left group"
                  >
                    <div className="w-10 h-10 bg-slate-800 rounded flex items-center justify-center overflow-hidden border border-slate-700">
                      <img src={`/api/open/${encodeURIComponent(file.name)}`} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-slate-200 block truncate group-hover:text-indigo-400">{file.name}</span>
                      <span className="text-[9px] text-slate-500 font-mono mt-0.5 uppercase">GAMBAR CLOUD</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSubPage('edit'); setCurrCapturedImage(`/api/open/${encodeURIComponent(file.name)}`); }}
                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit size={12} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsRenaming({ old: file.name, new: file.name.replace(/\.[^/.]+$/, "") }); }}
                        className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="Ubah Nama"
                      >
                        <PenTool size={12} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleExportExistingFile(file.name); }}
                        className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
                        title="Ekspor Word"
                      >
                        <Download size={12} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsDeleting(file.name); }}
                        className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Hapus"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center flex flex-col items-center gap-2">
                  <Search size={32} className="text-slate-800" />
                  <span className="text-xs text-slate-500">Tidak ada file gambar di Cloud Storage.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Spinner overlay inside phone */}
        {loading && (
          <div className="absolute inset-0 bg-slate-950/80 z-[100] flex flex-col items-center justify-center gap-3">
            <div className="relative flex items-center justify-center">
              <RefreshCw size={48} className="animate-spin text-emerald-500 opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-emerald-400">{progress}%</span>
              </div>
            </div>
            <div className="w-32 h-1 bg-slate-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-semibold tracking-wider text-emerald-400">Sedang memproses...</span>
          </div>
        )}

        {/* Dynamic page routes render */}
        
        {/* SUB PAGE A: MAIN SCREEN (Image 1, 2) */}
        {subPage === 'main' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {/* Header section with Search (Search Bar) */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-slate-900 shadow">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Pencarian"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-100 pl-8 pr-3 py-2 rounded-lg outline-none focus:border-emerald-600 transition-colors select-text"
                />
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setToast("Penyelarasan cloud aktif.")}
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg"
                  title="Cloud Sync"
                >
                  ⛅
                </button>
                <button 
                  onClick={() => setIsPremiumBannerOpen(true)}
                  className="p-1.5 bg-gradient-to-r from-amber-500 to-yellow-405 text-slate-950 rounded-lg text-[10px] font-bold shadow-md flex items-center gap-1 active:scale-95"
                  title="👑 Pro License"
                >
                  👑 VIP
                </button>
              </div>
            </div>

            {/* Content pane inside tab layout */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              
              {/* RENDER BERANDA TAB */}
              {tabActive === 'beranda' && (
                <>
                  {/* Premium banner mockup */}
                  <div className="bg-gradient-to-r from-amber-950/60 to-yellow-950/40 border border-amber-500/30 p-3 rounded-xl flex items-center justify-between shadow-lg">
                    <div className="text-left">
                      <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1">Kamu Adalah VIP Mas</h4>
                      <p className="text-[10px] text-slate-400">Dukungan OCR tak terbatas & de-skew miring otomatis.</p>
                    </div>
                    <span className="text-[10px] bg-amber-500 text-slate-950 font-bold px-2 py-0.5 rounded-full">Elite</span>
                  </div>

                  {/* Operational Quick Actions (Image 1 & 2 grid buttons) */}
                  <div>
                    <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase font-mono">Alat Utama</span>
                    <div className="grid grid-cols-4 gap-3 mt-2">
                      <button 
                        onClick={async () => {
                          setCurrCapturedImage(null);
                          await startCamera();
                          setSubPage('main'); // let UI video play
                        }}
                        className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all active:scale-95"
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-600/20 text-emerald-450 flex items-center justify-center shadow">
                          <Camera size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Scan</span>
                      </button>

                      <button 
                        onClick={() => setTabActive('alat')}
                        className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all active:scale-95"
                      >
                        <div className="w-10 h-10 rounded-full bg-red-600/20 text-red-405 flex items-center justify-center shadow">
                          <FileText size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Alat PDF</span>
                      </button>

                      <label className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all cursor-pointer active:scale-95">
                        <div className="w-10 h-10 rounded-full bg-blue-600/20 text-blue-450 flex items-center justify-center shadow">
                          <ImageIcon size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Impor Gb</span>
                        <input type="file" accept="image/*" onChange={handleImportFile} className="hidden" />
                      </label>

                      <label className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all cursor-pointer active:scale-95">
                        <div className="w-10 h-10 rounded-full bg-purple-600/20 text-purple-450 flex items-center justify-center shadow">
                          <Folder size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Impor Fl</span>
                        <input type="file" onChange={handleImportFile} className="hidden" />
                      </label>

                      <button 
                        onClick={() => setToast("Fitur Kartu ID mendaftarkan paspor/KTP miring untuk diluruskan.")}
                        className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all active:scale-95"
                      >
                        <div className="w-10 h-10 rounded-full bg-sky-600/20 text-sky-450 flex items-center justify-center shadow">
                          <User size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Kartu ID</span>
                      </button>

                      <button 
                        onClick={() => {
                          if (docs.length > 0) {
                            openMockDocumentToView(docs[0]);
                            setSubPage('edit');
                            setTimeout(() => triggerOnlineGeminiOcrParser(), 100);
                          } else {
                            setToast("Ambil dokumen terlebih dahulu.");
                          }
                        }}
                        className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all active:scale-95"
                      >
                        <div className="w-10 h-10 rounded-full bg-teal-600/20 text-teal-450 flex items-center justify-center shadow">
                          <Type size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Ekstrak Tx</span>
                      </button>

                      <button 
                        onClick={() => setToast("Solver AI akan menganalisis coretan matematika melalui foto.")}
                        className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all active:scale-95"
                      >
                        <div className="w-10 h-10 rounded-full bg-amber-600/20 text-amber-450 flex items-center justify-center shadow">
                          <Sparkles size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">AI Solver</span>
                      </button>

                      <button 
                        onClick={() => setIsCloudPickerOpen(true)}
                        className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all active:scale-95"
                      >
                        <div className="w-10 h-10 rounded-full bg-indigo-600/20 text-indigo-405 flex items-center justify-center shadow">
                          <RefreshCw size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Cloud M</span>
                      </button>

                      <button 
                        onClick={() => setTabActive('alat')}
                        className="flex flex-col items-center gap-1.5 p-2 bg-slate-900 hover:bg-slate-850 rounded-xl transition-all active:scale-95"
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-700/30 text-slate-300 flex items-center justify-center shadow">
                          <Layers size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-300">Semua</span>
                      </button>
                    </div>
                  </div>

                  {/* Camera overlay container, if stream was activated */}
                  {stream && (
                    <div className={isFullScreenCamera ? "fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center overflow-hidden" : "bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col items-center gap-3 relative shadow-inner"}>
                      <div className={`absolute top-4 ${isFullScreenCamera ? 'right-4' : 'right-2'} z-30 bg-red-600 font-bold ${isFullScreenCamera ? 'text-[10px]' : 'text-[8px]'} animate-pulse px-3 py-1 rounded-full text-white shadow-xl`}>
                        {isFullScreenCamera ? 'LIVE CAMERA' : 'LIVE PREVIEW'}
                      </div>
                      
                      <video 
                        id="mobile-video-el"
                        autoPlay
                        playsInline
                        ref={el => { if (el && stream) el.srcObject = stream; }}
                        className={`${isFullScreenCamera ? 'w-full h-full object-cover' : 'w-full bg-black aspect-square rounded-lg object-cover'} transition-all`}
                        style={{ transform: isBackCamera ? 'none' : 'scale-x(-1)' }}
                      />

                      <div className={isFullScreenCamera ? "absolute bottom-8 left-0 right-0 flex justify-center items-center gap-10 px-8 z-40 bg-gradient-to-t from-black/60 to-transparent pt-10 pb-6" : "flex gap-4 w-full mt-2"}>
                        <button 
                          onClick={() => { 
                            stream.getTracks().forEach(t=>t.stop()); 
                            setStream(null);
                            setIsFullScreenCamera(false);
                          }} 
                          className={isFullScreenCamera ? "w-14 h-14 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors" : "flex-1 py-1.5 bg-slate-800 text-slate-300 font-bold rounded-lg text-[10px]"}
                        >
                          {isFullScreenCamera ? <X size={24} /> : "Batal"}
                        </button>

                        <button 
                          onClick={capturePhoto} 
                          className={isFullScreenCamera ? "w-20 h-20 rounded-full bg-white border-[6px] border-white/20 flex items-center justify-center shadow-2xl active:scale-90 transition-all" : "flex-1 py-1.5 bg-emerald-650 hover:bg-emerald-600 text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 shadow-md"}
                        >
                          {isFullScreenCamera ? <div className="w-12 h-12 rounded-full border-4 border-slate-900/10" /> : "📸 Ambil Foto"}
                        </button>

                        {isFullScreenCamera && (
                           <button 
                            onClick={async () => {
                              const newFacing = !isBackCamera;
                              setIsBackCamera(newFacing);
                              // We need to wait for state update bit or pass it directly
                              try {
                                if (stream) { stream.getTracks().forEach(t => t.stop()); }
                                const constraints = {
                                  video: {
                                    facingMode: newFacing ? "environment" : "user",
                                    width: { ideal: 1024 },
                                    height: { ideal: 1024 }
                                  }
                                };
                                const newStream = await navigator.mediaDevices.getUserMedia(constraints);
                                setStream(newStream);
                              } catch(e) { setToast("Gagal ganti arah kamera."); }
                            }}
                            className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                          >
                            <RefreshCw size={24} />
                           </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Document List header (Terkini) */}
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xs font-bold text-slate-400 font-mono uppercase">Terkini</span>
                    <span className="text-[10px] text-slate-500 hover:underline cursor-pointer">Lihat Semua {" >"}</span>
                  </div>

                  {/* List of files with dynamic previews & screenshots elements */}
                  <div className="space-y-3">
                    {filteredDocs.length > 0 ? (
                      filteredDocs.slice(0, 6).map((doc, idx) => {
                        const isFirst = idx === 0;
                        return (
                          <div 
                            key={doc.id}
                            className="bg-slate-900/60 border border-slate-900 rounded-xl p-3 flex flex-col gap-3 hover:border-slate-800 transition-all shadow-sm"
                          >
                            <div 
                              onClick={() => openMockDocumentToView(doc)}
                              className="flex items-start gap-3 cursor-pointer"
                            >
                              <img 
                                src={doc.processedImage} 
                                className="w-14 h-18 object-cover rounded shadow border border-slate-800 text-[8px]" 
                                alt="Thumb"
                              />
                              <div className="flex-1 text-left min-w-0">
                                <h4 className="text-xs font-bold text-slate-100 truncate flex items-center gap-1.5">
                                  {doc.name}
                                  {isFirst && <span className="text-[8px] bg-sky-500/20 text-sky-400 font-bold px-1.5 py-0.2 rounded">Pertama</span>}
                                </h4>
                                <span className="text-[10px] text-slate-400 font-mono block mt-1">{doc.date} {doc.time}</span>
                                <span className="text-[9px] text-slate-500 block mt-0.5">📂 Dokumen Utama • 📄 {doc.pagesCount} halaman</span>
                              </div>
                            </div>

                            {/* Image 1 Quick buttons row underneath first document item */}
                            {isFirst && (
                              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60 text-[10px]">
                                <button 
                                  onClick={() => {
                                    setActiveDocId(doc.id);
                                    openMockDocumentToView(doc);
                                    downloadToLocalGallery();
                                  }}
                                  className="py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-slate-350 font-semibold flex items-center justify-center gap-1"
                                >
                                  <Share2 size={10} /> Bagikan
                                </button>
                                <button 
                                  onClick={() => {
                                    setActiveDocId(doc.id);
                                    openMockDocumentToView(doc);
                                    convertOfflineOcrToWordDocxFile();
                                  }}
                                  className="py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-indigo-400 font-semibold flex items-center justify-center gap-1"
                                >
                                  <FileText size={10} /> Ke Word
                                </button>
                                <button 
                                  onClick={() => openMockDocumentToView(doc)}
                                  className="py-1.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-emerald-450 font-semibold flex items-center justify-center gap-1"
                                >
                                  <Sliders size={10} /> Tampilan
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-slate-600 text-xs">
                        Tidak ada berkas ditemukan. Silakan potret dokumen baru!
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* RENDER FILES TAB */}
              {tabActive === 'file' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-400">File Manager</span>
                    <span className="text-[10px] text-slate-500">{docs.length} Berkas Tersimpan</span>
                  </div>
                  {docs.map(doc => (
                    <div 
                      key={doc.id}
                      className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 flex items-center justify-between group hover:border-emerald-500/30 transition-all cursor-pointer"
                      onClick={() => openMockDocumentToView(doc)}
                    >
                      <div className="flex items-center gap-2 text-left flex-1 min-w-0">
                        <Folder className="text-emerald-500" size={16} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold block text-slate-200 truncate">{doc.name}</span>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5">{doc.date}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 ml-2 shrink-0">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIsRenaming({ old: doc.name, new: doc.name }); }}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md"
                          title="Rename"
                        >
                          <Edit size={12} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIsDeleting(doc.name); }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-md"
                          title="Hapus"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <ChevronRight size={14} className="text-slate-500 group-hover:text-emerald-400 transition-colors shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {/* RENDER ALAT TAB (Image 8 details) */}
              {tabActive === 'alat' && (
                <div className="space-y-4 text-left">
                  <span className="text-xs font-bold text-slate-400 tracking-wider font-mono">Ketegori Alat</span>
                  
                  {/* Konversi */}
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-emerald-400 uppercase font-mono tracking-wider">Konversi Dokumen</h5>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button onClick={() => setIsCloudPickerOpen(true)} className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850">
                        <span className="text-teal-400 font-medium">Buka dari Cloud</span>
                        <ChevronRight size={10} />
                      </button>
                      <button onClick={convertOfflineOcrToWordDocxFile} className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850">
                        <span className="text-indigo-405 font-medium">Ke Word</span>
                        <ChevronRight size={10} />
                      </button>
                      <button onClick={() => setToast("Fitur Excel akan mengekstrak tabel secara lurus.")} className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850">
                        <span className="text-emerald-405 font-medium">Ke Excel</span>
                        <ChevronRight size={10} />
                      </button>
                      <button onClick={() => setToast("Eksport format PPT")} className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850">
                        <span className="text-amber-450 font-medium">Ke PPT</span>
                        <ChevronRight size={10} />
                      </button>
                      <button onClick={() => setToast("Fitur CountCam menghitung jumlah item pada foto.")} className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850">
                        <span className="text-sky-400 font-medium">CountCam</span>
                        <ChevronRight size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Impor */}
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-emerald-400 uppercase font-mono tracking-wider">Sumber Impor</h5>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850 cursor-pointer">
                        <span className="text-slate-300">Impor Gambar</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleImportFile} />
                        <Plus size={10} />
                      </label>
                      <label className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850 cursor-pointer">
                        <span className="text-slate-300">Impor File PDF</span>
                        <input type="file" className="hidden" onChange={handleImportFile} />
                        <Plus size={10} />
                      </label>
                    </div>
                  </div>

                  {/* Edit */}
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-emerald-400 uppercase font-mono tracking-wider">Perbaikan Manual & Tanda tangan</h5>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button 
                        onClick={() => {
                          if (docs.length > 0) {
                            openMockDocumentToView(docs[0]);
                            setIsSignatureMode(true);
                          } else {
                            setToast("Pilih berkas dari list terlebih dahulu.");
                          }
                        }}
                        className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850"
                      >
                        <span className="text-pink-400">Tanda tangani</span>
                        <PenTool size={10} />
                      </button>
                      <button 
                        onClick={() => {
                          if (docs.length > 0) {
                            openMockDocumentToView(docs[0]);
                            setIsWatermarkOpen(true);
                          } else {
                            setToast("Pilih berkas dari list.");
                          }
                        }}
                        className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850"
                      >
                        <span className="text-yellow-400">Tambah Watermark</span>
                        <Highlighter size={10} />
                      </button>
                      <button onClick={() => setToast("Fitur Gabungkan Berkas PDF")} className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850">
                        <span className="text-slate-400">Gabung File</span>
                        <ChevronRight size={10} />
                      </button>
                      <button onClick={() => setToast("Kunci file dengan enkripsi premium")} className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850 text-slate-500">
                        <span className="flex items-center gap-1">Kunci Berkas 👑</span>
                        <Lock size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Alat AI */}
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-bold text-emerald-400 uppercase font-mono tracking-wider">Suku AI Pintar (Gemini)</h5>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button 
                        onClick={() => setToast("Menghapus coretan penanda highlighter secara otomatis.")} 
                        className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850 text-indigo-300"
                      >
                        <span>Hapus Penanda</span>
                        <ChevronRight size={10} />
                      </button>
                      <button 
                        onClick={() => {
                          if (docs.length > 0) {
                            openMockDocumentToView(docs[0]);
                            setSubPage('edit');
                            setIsEraserMode(true);
                          } else {
                            setToast("Pilih berkas terlebih dahulu.");
                          }
                        }} 
                        className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between hover:bg-slate-850 text-teal-300"
                      >
                        <span>Hapus Cerdas</span>
                        <MinusCircle size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* RENDER SAYA TAB */}
              {tabActive === 'saya' && (
                <div className="space-y-4 text-left">
                  <div className="bg-slate-900 p-4 rounded-xl flex items-center gap-3 border border-slate-800 shadow">
                    <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-slate-950 font-bold text-xl uppercase shadow">
                      M
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-100 font-mono">marifinjombang@gmail.com</h4>
                      <span className="text-[10px] bg-gradient-to-r from-amber-500 to-yellow-450 text-slate-950 font-bold px-2 py-0.5 rounded-full mt-1 inline-block">VIP GOLD MEMBER</span>
                    </div>
                  </div>

                  {/* Storage Gauge */}
                  <div className="bg-slate-900/60 p-4 border border-slate-900 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Penyimpanan Akun</span>
                      <span className="font-bold text-amber-400">2,4 GB / 100 GB</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full rounded-full" style={{ width: '2.4%' }}></div>
                    </div>
                    <span className="text-[9px] text-slate-500 block leading-normal">Penyimpanan cloud premium tak terbatas berkat Elite License.</span>
                  </div>

                  {/* Settings and options */}
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl divide-y divide-slate-850 text-xs">
                    <div className="p-3 flex justify-between items-center cursor-pointer hover:bg-slate-850" onClick={() => setToast("Versi Aplikasi: 12.5.21")}>
                      <span>Versi Scanner</span>
                      <span className="text-slate-500 font-mono">v12.5.21</span>
                    </div>
                    <div className="p-3 flex justify-between items-center cursor-pointer hover:bg-slate-850" onClick={() => setToast("Fitur Enkripsi diaktifkan secara default.")}>
                      <span>Enkripsi Dokumen</span>
                      <span className="text-emerald-400 font-semibold font-mono">AKTIF</span>
                    </div>
                    <div className="p-3 flex justify-between items-center cursor-pointer hover:bg-slate-850" onClick={onClose}>
                      <span className="text-red-400 font-bold">Keluar CamScan</span>
                      <ChevronRight size={12} className="text-red-405" />
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Simulated app bottom tab bar navigation (Beranda, File, Alat, Saya) with hovering camera button */}
            <div className="bg-slate-950 border-t border-slate-900 py-2 px-6 flex justify-between items-center relative shrink-0">
              
              <button 
                onClick={() => setTabActive('beranda')}
                className={`flex flex-col items-center gap-0.5 ${tabActive === 'beranda' ? 'text-emerald-500' : 'text-slate-550'}`}
              >
                <span>🏠</span>
                <span className="text-[9px] font-bold">Beranda</span>
              </button>

              <button 
                onClick={() => setTabActive('file')}
                className={`flex flex-col items-center gap-0.5 ${tabActive === 'file' ? 'text-emerald-500' : 'text-slate-550'}`}
              >
                <span>📂</span>
                <span className="text-[9px] font-bold font-mono">File</span>
              </button>

              {/* Hovering Camera FAB slightly offset right as requested/images */}
              <button 
                onClick={async () => {
                  setCurrCapturedImage(null);
                  setIsFullScreenCamera(true);
                  await startCamera();
                  setToast("Kamera belakang dinyalakan. Silakan motret!");
                }}
                className="absolute -top-5 left-[62%] -translate-x-1/2 bg-emerald-650 hover:bg-emerald-600 border border-emerald-400/20 text-white p-3.5 rounded-full hover:scale-105 active:scale-95 transition-all w-12 h-12 flex items-center justify-center shadow-lg shadow-emerald-905/35 z-20"
                title="Seken Kamera Cepat"
              >
                <Camera size={20} />
              </button>

              <button 
                onClick={() => setTabActive('alat')}
                className={`flex flex-col items-center gap-0.5 mr-6 ${tabActive === 'alat' ? 'text-emerald-500' : 'text-slate-550'}`}
              >
                <span>🔳</span>
                <span className="text-[9px] font-bold">Alat</span>
              </button>

              <button 
                onClick={() => setTabActive('saya')}
                className={`flex flex-col items-center gap-0.5 ${tabActive === 'saya' ? 'text-emerald-500' : 'text-slate-550'}`}
              >
                <span>👤</span>
                <span className="text-[9px] font-bold">Saya</span>
              </button>
            </div>
          </div>
        )}

        {/* SUB PAGE B: POTONG (CROPPER SCREEN - Image 5) */}
        {subPage === 'crop' && (
          <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            
            {/* Header of Cropper */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between select-none font-sans">
              <button 
                onClick={() => setSubPage('main')}
                className="p-1 px-2.5 bg-slate-800 text-slate-300 font-bold rounded-lg text-xs hover:text-white"
              >
                Kembali
              </button>
              <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">Batas Bidang Potong</span>
              <button 
                onClick={executeBilinearAlign}
                className="p-1 px-3 bg-emerald-650 text-white font-bold rounded-lg text-xs hover:bg-emerald-600 flex items-center gap-1"
                title="Lakukan pelurusan perspektif bilinear"
              >
                ✓ Selesai
              </button>
            </div>

            {/* Dragger Space area frame */}
            <div className="flex-1 p-4 flex items-center justify-center relative bg-slate-900 pointer-events-auto min-h-0">
              
              <div 
                className="relative max-w-full max-h-[50vh] bg-slate-900 border border-slate-805 rounded shadow-lg overflow-hidden flex items-center justify-center"
                onPointerMove={handlePointerMoveAllDrag}
                onPointerUp={stopAllPointerDrag}
                onPointerLeave={stopAllPointerDrag}
              >
                <img 
                  id="original-to-warp-img"
                  src={currCapturedImage || ''}
                  className="max-w-full max-h-[50vh] object-contain select-none pointer-events-none"
                  alt="Kertas miring"
                />

                {/* Quad polygon and glowing handles mapping */}
                <div className="absolute inset-0 select-none pointer-events-none z-10">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full select-none pointer-events-none">
                    <polygon 
                      points={`${currCorners[0].x},${currCorners[0].y} ${currCorners[1].x},${currCorners[1].y} ${currCorners[2].x},${currCorners[2].y} ${currCorners[3].x},${currCorners[3].y}`}
                      fill="rgba(52, 211, 153, 0.22)"
                      stroke="#059669"
                      strokeWidth="1.5"
                    />
                  </svg>

                  {/* Corners handles (4 solid white/green circles) */}
                  {currCorners.map((corner, index) => (
                    <div 
                      key={index}
                      style={{ left: `${corner.x}%`, top: `${corner.y}%` }}
                      className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 bg-emerald-700 hover:bg-emerald-400 active:scale-125 rounded-full border-3 border-white cursor-pointer transition-all shadow-xl z-30 flex items-center justify-center pointer-events-auto touch-none"
                      onPointerDown={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        setActiveCorner(index);
                      }}
                    >
                      <span className="text-[10px] text-white font-extrabold">{index + 1}</span>
                    </div>
                  ))}

                  {/* Middle Capsule handle controls (as in Image 5) */}
                  {/* Top Edge Capsule */}
                  <div 
                    style={{ left: `${midTop.x}%`, top: `${midTop.y}%` }}
                    className="absolute w-8 h-3 -translate-x-1/2 -translate-y-1/2 bg-teal-400 hover:bg-teal-300 rounded-full border border-white cursor-row-resize pointer-events-auto touch-none shadow-md z-20 flex items-center justify-center"
                    onMouseDown={(e) => handleMidEdgeDragStart(e, 0, e.currentTarget.parentElement?.parentElement as HTMLDivElement)}
                  >
                    <div className="w-1.5 h-0.5 bg-teal-900 rounded-full"></div>
                  </div>

                  {/* Right Edge Capsule */}
                  <div 
                    style={{ left: `${midRight.x}%`, top: `${midRight.y}%` }}
                    className="absolute w-3 h-8 -translate-x-1/2 -translate-y-1/2 bg-teal-400 hover:bg-teal-300 rounded-full border border-white cursor-col-resize pointer-events-auto touch-none shadow-md z-20 flex items-center justify-center"
                    onMouseDown={(e) => handleMidEdgeDragStart(e, 1, e.currentTarget.parentElement?.parentElement as HTMLDivElement)}
                  >
                    <div className="w-0.5 h-1.5 bg-teal-900 rounded-full"></div>
                  </div>

                  {/* Bottom Edge Capsule */}
                  <div 
                    style={{ left: `${midBottom.x}%`, top: `${midBottom.y}%` }}
                    className="absolute w-8 h-3 -translate-x-1/2 -translate-y-1/2 bg-teal-400 hover:bg-teal-300 rounded-full border border-white cursor-row-resize pointer-events-auto touch-none shadow-md z-20 flex items-center justify-center"
                    onMouseDown={(e) => handleMidEdgeDragStart(e, 2, e.currentTarget.parentElement?.parentElement as HTMLDivElement)}
                  >
                    <div className="w-1.5 h-0.5 bg-teal-900 rounded-full"></div>
                  </div>

                  {/* Left Edge Capsule */}
                  <div 
                    style={{ left: `${midLeft.x}%`, top: `${midLeft.y}%` }}
                    className="absolute w-3 h-8 -translate-x-1/2 -translate-y-1/2 bg-teal-400 hover:bg-teal-300 rounded-full border border-white cursor-col-resize pointer-events-auto touch-none shadow-md z-20 flex items-center justify-center"
                    onMouseDown={(e) => handleMidEdgeDragStart(e, 3, e.currentTarget.parentElement?.parentElement as HTMLDivElement)}
                  >
                    <div className="w-0.5 h-1.5 bg-teal-900 rounded-full"></div>
                  </div>
                </div>

              </div>
            </div>

            {/* Quick action buttons row above footer (Image 5 buttons page layout: Kiri, Kanan, Potong Otomatis, Semua) */}
            <div className="bg-slate-900/80 px-4 py-3 border-t border-slate-800 grid grid-cols-4 gap-2 text-center select-none shadow">
              <button 
                onClick={() => rotateSourceImage(false)}
                className="py-2.5 bg-slate-950 hover:bg-slate-800 rounded-xl text-[10px] font-bold text-slate-350 active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span className="text-[12px]">⟲</span>
                <span>Kiri</span>
              </button>
              
              <button 
                onClick={() => rotateSourceImage(true)}
                className="py-2.5 bg-slate-950 hover:bg-slate-800 rounded-xl text-[10px] font-bold text-slate-350 active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span className="text-[12px]">⟳</span>
                <span>Kanan</span>
              </button>

              <button 
                onClick={() => {
                  setCurrCorners([
                    { x: 12, y: 15 },
                    { x: 88, y: 15 },
                    { x: 88, y: 85 },
                    { x: 12, y: 85 }
                  ]);
                  setToast("Batas dokumen diatur ulang ke bingkai kertas.");
                }}
                className="py-2.5 bg-slate-950 hover:bg-slate-800 rounded-xl text-[10px] font-bold text-slate-350 active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span>✂️</span>
                <span>Potong Otomatis</span>
              </button>

              <button 
                onClick={() => {
                  setCurrCorners([
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 100, y: 100 },
                    { x: 0, y: 100 }
                  ]);
                  setToast("Batas dokumen dilebarkan maksimal.");
                }}
                className="py-2.5 bg-slate-950 hover:bg-slate-850 rounded-xl text-[10px] font-bold text-slate-350 active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span>📐</span>
                <span>Semua</span>
              </button>
            </div>

            {/* Footer containing X, Potong, Checkmark */}
            <div className="bg-slate-950 px-6 py-4 flex items-center justify-between border-t border-slate-900 shrink-0 select-none">
              <button 
                onClick={() => setSubPage('main')} 
                className="text-slate-400 hover:text-white p-2"
                title="Batal"
              >
                <X size={20} />
              </button>
              <span className="text-xs font-bold text-slate-400">Potong Kertas</span>
              <button 
                onClick={executeBilinearAlign}
                className="text-emerald-500 hover:text-emerald-400 p-2"
                title="Terapkan warp bilinear"
              >
                <Check size={20} />
              </button>
            </div>
          </div>
        )}

        {/* SUB PAGE C: FILTER & EDIT (Image 6 filter page layout) */}
        {subPage === 'edit' && (
          <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            
            {/* Top Bar of Editor */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3.5 flex items-center justify-between font-sans">
              <button 
                onClick={() => setSubPage('crop')}
                className="text-slate-400 hover:text-white"
                title="Batalkan"
              >
                <X size={18} />
              </button>
              <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">Perbaiki Warna</span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={downloadToLocalGallery}
                  className="text-slate-300 font-bold text-xs"
                >
                  Bagikan
                </button>
                <button 
                  onClick={saveProcessedDocSessionFile}
                  className="px-2.5 py-1 bg-emerald-650 hover:bg-emerald-600 font-bold rounded text-white text-xs select-none"
                >
                  Selesai
                </button>
              </div>
            </div>

            {/* Main view container showing processed document with Trash deletion button */}
            <div className="flex-1 p-4 flex items-center justify-center relative min-h-0 bg-slate-950">
              
              <div className="relative max-w-full max-h-[48vh] bg-slate-900 border border-slate-800 rounded-lg shadow-xl overflow-hidden flex items-center justify-center">
                
                {/* Simulated Delete Page Trash Button on top left */}
                <button
                  onClick={() => setIsDeleting("HALAMAN_INI")}
                  className="absolute top-2.5 left-2.5 bg-red-955/80 hover:bg-red-900/90 text-red-200 border border-red-800 p-1.5 rounded-full shadow z-25 active:scale-95 transition-all text-left"
                  title="Hapus / Buang sekor halaman ini"
                >
                  <Trash2 size={13} />
                </button>

                {/* Main page filtered image */}
                <div className="relative cursor-crosshair" onClick={clickAddTextWord}>
                  <img 
                    src={currProcessedImage || currWarpedImage || ''}
                    className="max-w-full max-h-[48vh] object-contain pointer-events-none select-none animate-fade-in"
                    alt="Filtered Result"
                  />

                  {/* Texts overlays layer */}
                  <div className="absolute inset-0 pointer-events-auto select-none">
                    {currWords.map((word, idx) => {
                      const isSel = selectedWordIdx === idx;
                      return (
                        <div 
                          key={idx}
                          onClick={(e) => { e.stopPropagation(); setSelectedWordIdx(idx); }}
                          style={{
                            left: `${word.x}%`,
                            top: `${word.y}%`,
                            width: `${word.w}%`,
                            height: `${word.h}%`,
                            backgroundColor: isSel ? 'rgba(14, 165, 233, 0.35)' : (word.bg === 'transparent' ? 'rgba(255,255,255,0.06)' : word.bg),
                            color: word.color,
                            fontSize: `${word.fontSize * 1.3}vw`,
                            border: isSel ? '2px dashed #0284c7' : '1px solid rgba(16, 185, 129, 0.3)',
                          }}
                          className="absolute flex items-center justify-start overflow-hidden px-1 rounded cursor-pointer font-bold select-none text-center"
                        >
                          <span className="truncate w-full text-[8px] sm:text-[10px] scale-90">{word.text || 'Kosong'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* Smart Annotation & Signature pencil boards overlays */}
            {isSignatureMode && (
              <div className="absolute inset-x-0 bottom-0 bg-slate-900 border-t border-slate-800 p-4 z-40 space-y-3 antialiased select-none animate-slide-up shadow-2xl">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-emerald-450 uppercase font-mono">Bubuhkan Tanda Tangan Pena</span>
                  <button onClick={() => setIsSignatureMode(false)} className="text-slate-400 hover:text-white"><X size={15} /></button>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-1.5 rounded-lg relative">
                  <canvas 
                    ref={signatureCanvasRef}
                    width={400}
                    height={160}
                    onMouseDown={startSignatureDraw}
                    onMouseMove={paintSignatureLine}
                    onMouseUp={() => setIsDrawingSignature(false)}
                    onMouseLeave={() => setIsDrawingSignature(false)}
                    className="w-full bg-slate-950 h-32 rounded cursor-crosshair border border-slate-850"
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <button onClick={() => {
                      const canvas = signatureCanvasRef.current;
                      if(canvas) {
                        const ctx = canvas.getContext('2d');
                        if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height);
                      }
                    }} className="px-2 py-0.5 bg-slate-900 text-[10px] text-slate-400 hover:text-white rounded">Bersihkan</button>
                    <button onClick={applySignatureIntoDocumentPage} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 font-bold text-[10px] text-slate-950 rounded">Terapkan Ink</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] text-slate-400">Pilih Warna:</span>
                  {['#000000', '#dc2626', '#1d4ed8'].map(c => (
                    <button key={c} onClick={() => setSigColor(c)} className={`w-4 h-4 rounded-full border ${sigColor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            )}

            {/* Smart Eraser overlay (Hapus Cerdas Canvas Brush) */}
            {isEraserMode && (
              <div className="absolute inset-x-0 bottom-0 bg-slate-900 border-t border-slate-800 p-4 z-40 space-y-3 antialiased select-none">
                <div className="flex justify-between items-center pb-2">
                  <span className="text-xs font-bold text-teal-400 font-mono">HAPUS CERDAS BRUSH</span>
                  <button onClick={() => setIsEraserMode(false)} className="text-slate-400 hover:text-white"><X size={14} /></button>
                </div>
                <p className="text-[10px] text-slate-400">Goreskan kuas putih di atas kertas untuk menghapus bagian tulisan kotor.</p>
                <div className="bg-slate-950 p-1 rounded border border-slate-850">
                  <canvas 
                    width={400}
                    height={140}
                    onMouseDown={startSmartEraserPaint}
                    onMouseMove={playSmartEraserLine}
                    onMouseUp={() => setIsErasing(false)}
                    onMouseLeave={() => setIsErasing(false)}
                    ref={(el) => {
                      if (el && !eraserCanvasRef.current) {
                        eraserCanvasRef.current = el;
                        const ctx = el.getContext('2d');
                        if (ctx && currProcessedImage) {
                          const img = new Image();
                          img.onload = () => ctx.drawImage(img, 0,0, el.width, el.height);
                          img.src = currProcessedImage;
                        }
                      }
                    }}
                    className="w-full bg-white h-32 rounded cursor-crosshair"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <span>Radius Kuas:</span>
                    <input type="range" min="5" max="40" value={eraserRadius} onChange={(e) => setEraserRadius(Number(e.target.value))} className="h-1" />
                    <span className="font-mono">{eraserRadius}px</span>
                  </div>
                  <button onClick={saveSmartEraserCanvas} className="px-3 py-1 bg-teal-600 text-slate-950 font-bold rounded">Simpan Penghapusan</button>
                </div>
              </div>
            )}

            {/* Editing sub actions (Screenshot 6 slider parameters or popup modifiers) */}
            {selectedWordIdx !== null && currWords[selectedWordIdx] && (
              <div className="bg-sky-950/30 border-t border-sky-900/40 p-3 flex flex-col gap-2 relative">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-sky-305 font-bold font-mono">SUNTING TEKS (AI GABUNG)</span>
                  <button onClick={() => deleteWordBox(selectedWordIdx)} className="text-red-400 bg-red-500/10 p-1 rounded"><Trash2 size={11} /></button>
                </div>
                <input 
                  type="text"
                  value={currWords[selectedWordIdx].text}
                  onChange={(e) => updateWordText(selectedWordIdx, e.target.value)}
                  className="w-full bg-slate-900 border border-sky-850 px-2 py-1.5 rounded text-xs select-text focus:outline-none"
                  placeholder="Ketik ulasan teks tulisan..."
                />
                
                {/* Sliders for moving position */}
                <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400">
                  <div className="flex flex-col gap-0.5">
                    <span>Posisi X (%):</span>
                    <input type="range" min="0" max="95" value={currWords[selectedWordIdx].x} onChange={(e)=>updateWordParam(selectedWordIdx, 'x', Number(e.target.value))} className="h-1 accent-sky-505" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span>Posisi Y (%):</span>
                    <input type="range" min="0" max="95" value={currWords[selectedWordIdx].y} onChange={(e)=>updateWordParam(selectedWordIdx, 'y', Number(e.target.value))} className="h-1 accent-sky-505" />
                  </div>
                </div>
                <button onClick={() => setSelectedWordIdx(null)} className="w-full py-1 bg-sky-600 text-white font-bold rounded text-[10px] mt-1">Terapkan Suntingan</button>
              </div>
            )}

            {/* Image 6 active tab buttons block: Gambar, Tandai, Halaman */}
            <div className="bg-slate-900 border-t border-slate-800 flex items-center justify-around text-xs py-1.5 shrink-0 select-none">
              <button className="flex-1 py-1 text-emerald-450 border-b-2 border-emerald-500 font-bold flex justify-center items-center gap-1.5">
                <ImageIcon size={12} /> Gambar
              </button>
              <button onClick={() => { setIsSignatureMode(true); setToast("Bubuhkan pena tanda tangan."); }} className="flex-1 py-1 text-slate-400 hover:text-white flex justify-center items-center gap-1.5">
                <PenTool size={12} /> Tandai
              </button>
              <button onClick={() => setToast("Fitur Multi Halaman didukung oleh lisensi premium.")} className="flex-1 py-1 text-slate-400 hover:text-white flex justify-center items-center gap-1.5">
                <Layers size={12} /> Halaman
              </button>
            </div>

            {/* Filter actions row page bottom (Image 6 actions toolbar: CS PDF, Potong, Filter, Edit Teks, Hapus Cerdas, Ambil Ulang) */}
            <div className="bg-slate-950 border-t border-slate-900/60 px-4 py-3 grid grid-cols-3 gap-3 text-center shrink-0">
              
              <button 
                onClick={() => setIsPDFUtilitiesOpen(true)}
                className="py-2 bg-slate-900 hover:bg-slate-850 text-[10px] font-bold text-slate-350 rounded-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span>📜</span>
                <span>CS PDF</span>
              </button>

              <button 
                onClick={() => setSubPage('crop')}
                className="py-2 bg-slate-900 hover:bg-slate-850 text-[10px] font-bold text-slate-350 rounded-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span>📐</span>
                <span>Potong</span>
              </button>

              <button 
                onClick={() => {
                  const options = ['none', 'grayscale', 'hitam_putih', 'dokumen', 'perbaiki_warna'];
                  const curIdx = options.indexOf(currFilter);
                  const nextOpt = options[(curIdx + 1) % options.length] as any;
                  setCurrFilter(nextOpt);
                  setToast(`Menerapkan filter: ${nextOpt.toUpperCase()}`);
                }}
                className="py-2 bg-slate-900 hover:bg-slate-850 text-[10px] font-bold text-emerald-450 rounded-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-1 border border-emerald-950/20"
              >
                <span>🔮</span>
                <span className="capitalize">{currFilter === 'none' ? 'Filter' : currFilter.replace('_', ' ')}</span>
              </button>

              <button 
                onClick={triggerOnlineGeminiOcrParser}
                disabled={loading}
                className="py-2 bg-slate-900 hover:bg-slate-850 text-[10px] font-bold text-slate-350 rounded-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span>👑</span>
                <span>{loading ? 'Memilah..' : 'Edit Teks'}</span>
              </button>

              <button 
                onClick={() => { setIsEraserMode(true); setToast("Hapus Cerdas diaktifkan."); }}
                className="py-2 bg-slate-900 hover:bg-slate-850 text-[10px] font-bold text-slate-350 rounded-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span>🧼</span>
                <span>Hapus Cerdas</span>
              </button>

              <button 
                onClick={async () => {
                  setCurrCapturedImage(null);
                  await startCamera();
                  setSubPage('main');
                }}
                className="py-2 bg-slate-900 hover:bg-slate-850 text-[10px] font-bold text-slate-350 rounded-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-1"
              >
                <span>🔄</span>
                <span>Ambil Ulang</span>
              </button>
            </div>
            
            {/* Fine tuning parameters slider overlay - Toggles Panel */}
            <div 
              className="bg-slate-900 px-4 py-2 flex items-center justify-between shrink-0 border-t border-slate-900 hover:bg-slate-850/40 cursor-pointer text-[10px]" 
              onClick={() => setIsAdjustOpen(!isAdjustOpen)}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><Sparkles size={10} className="text-emerald-450" /> Kecerahan: <strong className="text-emerald-450">{currBrightness}</strong></span>
                <span>•</span>
                <span>Kontras: <strong className="text-emerald-450">{currContrast}</strong></span>
                <span>•</span>
                <span>Rotasi: <strong className="text-emerald-450">{currRotation}°</strong></span>
              </div>
              <ChevronRight size={14} className={`text-slate-500 transition-transform ${isAdjustOpen ? 'rotate-90' : ''}`} />
            </div>

            {/* ADJUSTMENT PANEL (Brightness, Contrast, Rotation) */}
            {isAdjustOpen && (
              <div className="bg-slate-950 border-t border-emerald-900/30 p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-emerald-400 font-mono tracking-widest uppercase">PENGATURAN GAMBAR</span>
                  <button onClick={() => setIsAdjustOpen(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
                </div>
                
                {/* Brightness Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Kecerahan</span>
                    <span className="font-mono text-emerald-400">{currBrightness > 0 ? '+' : ''}{currBrightness}</span>
                  </div>
                  <input 
                    type="range" 
                    min="-100" 
                    max="100" 
                    value={currBrightness} 
                    onChange={(e) => setCurrBrightness(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Contrast Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Kontras</span>
                    <span className="font-mono text-emerald-400">{currContrast > 0 ? '+' : ''}{currContrast}</span>
                  </div>
                  <input 
                    type="range" 
                    min="-100" 
                    max="100" 
                    value={currContrast} 
                    onChange={(e) => setCurrContrast(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                {/* Rotation Toggle/Buttons */}
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Rotasi</span>
                  <div className="flex gap-2">
                    {[0, 90, 180, 270].map(deg => (
                      <button 
                        key={deg}
                        onClick={() => {
                          setCurrRotation(deg);
                          setToast(`Sumbu rotasi disetel ke ${deg}°`);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${currRotation === deg ? 'bg-emerald-600 text-slate-950' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
                      >
                        {deg}°
                      </button>
                    ))}
                    <button 
                      onClick={() => setCurrRotation((currRotation + 90) % 360)}
                      className="p-1 px-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                      title="Putar 90°"
                    >
                      <RotateCw size={12} />
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setCurrBrightness(0);
                    setCurrContrast(0);
                    setCurrRotation(0);
                    setToast("Parameter gambar dikembalikan ke awal.");
                  }}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 text-slate-500 hover:text-slate-300 text-[10px] font-bold rounded-lg transition-colors"
                >
                  Reset Parameter
                </button>
              </div>
            )}
          </div>
        )}

        {/* SUB PAGE D: DOCUMENT DETAILS "VIEW" PAGE (Image 7 view page layout) */}
        {subPage === 'view' && (
          <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
            
            {/* Top Bar of details screen */}
            <div className="bg-slate-900 border-b border-slate-850 px-4 py-3 flex items-center justify-between font-sans">
              <button 
                onClick={() => setSubPage('main')}
                className="p-1 px-2.5 bg-slate-800 text-slate-300 font-bold rounded-lg text-xs flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Kembali
              </button>
              
              {/* Filename with inline pencil click to rename */}
              <div className="flex-1 text-center font-bold px-3 min-w-0">
                <div 
                  className="flex items-center justify-center gap-1 text-xs text-white truncate cursor-pointer hover:underline"
                  onClick={() => {
                    const activeDoc = docs.find(d => d.id === activeDocId);
                    if (activeDoc) {
                      setRenameInput(activeDoc.name);
                      setIsRenameOpen(true);
                    }
                  }}
                >
                  <span className="truncate">{docs.find(d => d.id === activeDocId)?.name || 'CamScan File'}</span>
                  <span>✏️</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/35">1/1</span>
              </div>
            </div>

            {/* Main Document Frame card with 1/1 overlay and Tambahkan append option */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              
              {/* Preview Box image */}
              <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-2xl max-w-xs mx-auto relative shadow-2xl">
                <span className="absolute top-4 left-4 bg-emerald-650/90 text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full z-10 shadow">1/1</span>
                
                <img 
                  src={currProcessedImage || currCapturedImage || ''}
                  className="w-full aspect-[3/4] object-contain bg-slate-950 rounded-xl"
                  alt="Saved Page"
                />
              </div>

              {/* Dotted border Tambahkan button (Add page) matching Image 7 inside display container */}
              <button 
                onClick={async () => {
                  setCurrCapturedImage(null);
                  await startCamera();
                  setSubPage('crop');
                  setToast("Kamera dipicu untuk menambah halaman berkas.");
                }}
                className="w-full max-w-xs mx-auto border-2 border-dashed border-slate-800 hover:border-emerald-600 rounded-xl py-5 px-4 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-emerald-400 transition-colors bg-slate-900/40"
              >
                <Plus size={16} />
                <span className="text-[10px] font-bold">Tambahkan</span>
                <span className="text-[8px] text-slate-600 uppercase font-mono mt-0.5 mt-0.5">Tambahkan halaman baru di file ini</span>
              </button>
            </div>

            {/* Bottom Primary Actions Row (Screenshot 7 bottom row: Tambahkan, Edit, Bagikan, Ke Word, Tanda tangani) */}
            <div className="bg-slate-950 border-t border-slate-900 px-2 py-3.5 grid grid-cols-5 gap-1.5 text-center shrink-0 shadow">
              
              <button 
                onClick={async () => {
                  setCurrCapturedImage(null);
                  await startCamera();
                  setSubPage('crop');
                  setToast("Buka capture halaman baru.");
                }}
                className="flex flex-col items-center justify-center gap-1 p-1 block bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-350 select-none active:scale-95 transition-all"
              >
                <Plus size={13} className="text-emerald-500" />
                <span className="text-[8px] font-bold">Tambahkan</span>
              </button>

              <button 
                onClick={() => setSubPage('edit')}
                className="flex flex-col items-center justify-center gap-1 p-1 block bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-350 select-none active:scale-95 transition-all"
              >
                <Edit size={13} className="text-sky-400" />
                <span className="text-[8px] font-bold font-mono">Edit</span>
              </button>

              <button 
                onClick={() => setIsShareSheetOpen(true)}
                className="flex flex-col items-center justify-center gap-1 p-1 block bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-350 select-none active:scale-95 transition-all"
              >
                <Share2 size={13} className="text-emerald-450" />
                <span className="text-[8px] font-bold">Bagikan</span>
              </button>

              <button 
                onClick={convertOfflineOcrToWordDocxFile}
                className="flex flex-col items-center justify-center gap-1 p-1 block bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-350 select-none active:scale-95 transition-all border border-indigo-950/40"
              >
                <FileText size={13} className="text-indigo-400 animate-pulse" />
                <span className="text-[8px] font-bold">Ke Word</span>
              </button>

              <button 
                onClick={() => { setIsSignatureMode(true); setSubPage('edit'); setToast("Buka mode penandatanganan pen."); }}
                className="flex flex-col items-center justify-center gap-1 p-1 block bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-350 select-none active:scale-95 transition-all"
              >
                <PenTool size={13} className="text-pink-400" />
                <span className="text-[8px] font-bold">Tanda tangani</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* 3. EXTRA INTERACTIVE POPUP MODALS SIMULATION */}
      
      {/* A. Rename file dialog */}
      {isRenameOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-xs space-y-4">
            <h4 className="text-xs font-bold text-white tracking-wide uppercase font-mono text-emerald-400">Ubah Nama Dokumen</h4>
            <input 
              type="text" 
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 p-2 text-xs rounded-lg text-teal-200 outline-none select-text" 
              placeholder="Masukkan nama berkas..."
            />
            <div className="flex gap-2 text-xs font-bold">
              <button onClick={() => setIsRenameOpen(false)} className="flex-1 py-2 bg-slate-800 text-slate-300 rounded-lg">Batal</button>
              <button 
                onClick={() => {
                  if (renameInput.trim()) {
                    setDocs(docs.map(doc => doc.id === activeDocId ? { ...doc, name: renameInput } : doc));
                    setToast("Nama berkas diperbarui.");
                    setIsRenameOpen(false);
                  }
                }} 
                className="flex-1 py-2 bg-emerald-600 text-slate-950 rounded-lg"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. Watermark config sheet option */}
      {isWatermarkOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl w-full max-w-xs space-y-3 font-sans">
            <span className="text-xs font-bold font-mono text-yellow-405 block uppercase">Modifikasi Penanda Watermark</span>
            <input 
              type="text" 
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs select-text focus:outline-none" 
              placeholder="Contoh: DRAFT / COPY / DO NOT EDIT"
            />
            <div className="flex gap-2 text-[10px] font-bold mt-2">
              <button onClick={() => { setIsWatermarkOpen(false); setToast("Watermark dibatalkan."); }} className="flex-1 py-1.5 bg-slate-800 text-slate-400 rounded">Hilangkan</button>
              <button onClick={() => { setIsWatermarkOpen(false); setToast("Watermark diatur! Silakan simpan dokumen."); }} className="flex-1 py-1.5 bg-yellow-500 text-slate-950 rounded">Terapkan Penanda</button>
            </div>
          </div>
        </div>
      )}

      {/* C. Share options sheet */}
      {isShareSheetOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[110] animate-in slide-in-from-bottom duration-300">
           <div className="bg-slate-950 border-t border-slate-800 rounded-t-3xl w-full max-w-sm p-6 space-y-6 pb-12 shadow-2xl">
              <div className="flex justify-between items-center px-2">
                <div>
                  <h4 className="text-white font-bold text-lg">Bagikan Dokumen</h4>
                  <p className="text-slate-500 text-xs mt-1 font-mono uppercase tracking-widest">{docs.find(d => d.id === activeDocId)?.name || `Scan_${Date.now()}`}</p>
                </div>
                <button onClick={() => setIsShareSheetOpen(false)} className="p-2 bg-slate-900 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={downloadToLocalGallery}
                  className="flex flex-col items-center gap-3 p-5 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-slate-850 active:scale-95 transition-all text-emerald-400"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Download size={24} />
                  </div>
                  <span className="text-xs font-bold text-slate-200">Unduh Lokal</span>
                </button>

                <button 
                  onClick={saveToCloud}
                  className="flex flex-col items-center gap-3 p-5 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-slate-850 active:scale-95 transition-all text-blue-400"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Globe size={24} />
                  </div>
                  <span className="text-xs font-bold text-slate-200">Simpan ke Cloud</span>
                </button>
              </div>

              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                 <p className="text-[10px] text-slate-500 leading-relaxed text-center italic">
                   Email akun saat ini: <span className="text-blue-400 font-bold">{user?.email || "Guest"}</span>. File cloud akan dapat diakses dari menu File Berkas Manager di dashboard utama.
                 </p>
              </div>

              <button 
                onClick={() => {
                  if (navigator.share) {
                    constructFinalCanvasImage().then(canvas => {
                      canvas.toBlob(blob => {
                        if (blob) {
                           const file = new File([blob], "scan.png", { type: "image/png" });
                           navigator.share({
                             files: [file],
                             title: 'Hasil Scan',
                             text: 'Bagikan dokumen hasil scan saya'
                           }).catch(() => setToast("Gagal berbagi via sistem."));
                        }
                      });
                    });
                  } else {
                    setToast("Browser tidak mendukung Web Share API.");
                  }
                }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl transition-colors shadow-lg shadow-emerald-900/20"
              >
                Gunakan Bagian Sistem
              </button>
           </div>
        </div>
      )}

      {/* C. PDF list options popup sheet (Image 4 list style) */}
      {isPDFUtilitiesOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl w-full max-w-xs space-y-3 select-none font-sans">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-red-550 uppercase font-mono flex items-center gap-1">✨ CS PDF UTILITIES MENU</span>
              <button onClick={() => setIsPDFUtilitiesOpen(false)} className="text-slate-400 hover:text-white"><X size={14} /></button>
            </div>
            
            <div className="space-y-2 text-xs">
              <button onClick={() => { setIsPDFUtilitiesOpen(false); downloadToLocalGallery(); }} className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-left flex items-center gap-2">
                <span>📄</span> Export PDF / Gambar Halaman Tunggal
              </button>
              <button onClick={() => { setIsPDFUtilitiesOpen(false); setIsWatermarkOpen(true); }} className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-left flex items-center gap-2 text-yellow-400">
                <span>⚡</span> Tambah Translucent Watermark Kertas
              </button>
              <button onClick={() => { setIsPDFUtilitiesOpen(false); setToast("PDF Terkompresi 60% lebih ringan!"); }} className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-left flex items-center gap-2">
                <span>📉</span> Kompres Ukuran Berkas / Kualitas PDF
              </button>
              <button onClick={() => { setIsPDFUtilitiesOpen(false); setToast("Mengatur urutan halaman PDF... (Premium)"); }} className="w-full p-2.5 bg-slate-950 hover:bg-slate-800 rounded-lg text-left flex items-center gap-2">
                <span>📑</span> Atur Ulang Posisi Lembar Kertas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. Brand Elite Premium Dialog */}
      {isPremiumBannerOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-slate-900 border-2 border-amber-500 p-6 rounded-2xl w-full max-w-xs text-center space-y-4 shadow-xl">
            <span className="text-3xl">🏆</span>
            <h4 className="text-sm font-bold text-amber-400 font-mono tracking-wider">LALUAN PREMIUM CAMSCAN</h4>
            <div className="text-[11px] text-slate-350 leading-relaxed text-left space-y-2">
              <p>✓ Akses de-skew bilinear meluruskan gambar miring tak terbatas.</p>
              <p>✓ OCR Online bertenaga Gemini 3.5 deteksi tulisan otomatis.</p>
              <p>✓ Konversi docx Word, Excel, watermark tanpa gangguan iklan.</p>
              <p>✓ Masa berlaku Premium: <strong>Selamanya (Lifetime)</strong>.</p>
            </div>
            <button onClick={() => setIsPremiumBannerOpen(false)} className="w-full py-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold rounded-lg text-xs leading-none active:scale-95 transition-all">
              Tutup Penjelas
            </button>
          </div>
        </div>
      )}

      {/* CUSTOM MODAL: RENAME */}
      {isRenaming && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-xs shadow-2xl">
            <h3 className="text-slate-200 font-bold mb-4 flex items-center gap-2">
              <Edit className="text-emerald-500" size={18} />
              Ubah Nama
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Nama Baru</label>
                <input 
                  autoFocus
                  type="text"
                  value={isRenaming.new}
                  onChange={(e) => setIsRenaming({...isRenaming, new: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Masukkan nama..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameCloudFile();
                    if (e.key === 'Escape') setIsRenaming(null);
                  }}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button 
                  onClick={() => setIsRenaming(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleRenameCloudFile}
                  className="px-4 py-2 text-xs font-bold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM MODAL: DELETE CONFIRMATION */}
      {isDeleting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-xs shadow-2xl">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-slate-200 font-bold text-center mb-2">Hapus Item?</h3>
            <p className="text-slate-400 text-xs text-center mb-6 leading-relaxed">
              {isDeleting === "HALAMAN_INI" ? "Hapus dokumen halaman seken ini?" : `Anda akan menghapus "${isDeleting}". Tindakan ini tidak dapat dibatalkan.`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setIsDeleting(null)}
                className="py-2.5 text-xs font-bold text-slate-300 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={() => {
                  if (isDeleting === "HALAMAN_INI") {
                    setCurrCapturedImage(null);
                    setSubPage('main');
                    setIsDeleting(null);
                    setToast("Halaman seken dibatalkan.");
                  } else {
                    const docToDelete = docs.find(d => d.name === isDeleting);
                    if (docToDelete) {
                      setDocs(prev => prev.filter(d => d.name !== isDeleting));
                      setIsDeleting(null);
                      setToast("Dokumen lokal dihapus.");
                    } else {
                      confirmDeleteFile();
                    }
                  }
                }}
                className="py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-500 shadow-lg shadow-red-900/20 transition-colors"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
