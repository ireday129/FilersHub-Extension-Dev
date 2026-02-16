import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileText,
  Download,
  Eye,
  Megaphone,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  FileCode,
  Calendar,
  User,
  CheckCircle,
  Filter,
  Upload,
  Plus,
  X,
  DollarSign,
  Landmark,
  Wallet,
  Settings,
  CreditCard,
  Save,
  Loader2,
  BellPlus,
  Type,
  Users,
  Briefcase,
  GripVertical,
  RotateCcw,
  Trash2,
  PenTool,
  StickyNote,
  FileCheck,
  MousePointer2,
  Hand,
  CheckSquare,
  Circle
} from 'lucide-react';
import { UserRole, TaxReturnStatus, FILE_UPLOAD_TYPES, TAX_RETURN_TYPES, isStaffRole, TAX_YEARS, TaxReturn, DocStatus, Task } from '../types';
import { uploadDocument } from '../services/documents';
import { supabase } from '../services/supabase';

interface DashboardProps {
  role: UserRole;
  returns: TaxReturn[];
  setReturns: React.Dispatch<React.SetStateAction<TaxReturn[]>>;
  selectedReturnId: string | null;
  setSelectedReturnId: (id: string | null) => void;
  refreshData: () => Promise<void>;
  firmId: string | null;
  isExtension?: boolean;
}

const STATUS_EMOJIS: Record<TaxReturnStatus, string> = {
  [TaxReturnStatus.IntakeReceived]: '📝',
  [TaxReturnStatus.ComplianceReview]: '🔍',
  [TaxReturnStatus.InPreparation]: '🛠',
  [TaxReturnStatus.MissingDocuments]: '📂',
  [TaxReturnStatus.ReadyForSignature]: '🧾',
  [TaxReturnStatus.InvoiceSent]: '💵',
  [TaxReturnStatus.BankProduct]: '🏛️',
  [TaxReturnStatus.Filed]: '🚀',
  [TaxReturnStatus.Rejected]: '❌',
  [TaxReturnStatus.Accepted]: '⏳'
};

const DEFAULT_DASHBOARD_STATUSES = [
  TaxReturnStatus.IntakeReceived,
  TaxReturnStatus.MissingDocuments,
  TaxReturnStatus.ComplianceReview,
  TaxReturnStatus.InvoiceSent,
  TaxReturnStatus.InPreparation,
  TaxReturnStatus.ReadyForSignature,
  TaxReturnStatus.Filed,
  TaxReturnStatus.Accepted
];

const STATUS_ORDER = [
  TaxReturnStatus.IntakeReceived,
  TaxReturnStatus.ComplianceReview,
  TaxReturnStatus.InPreparation,
  TaxReturnStatus.MissingDocuments,
  TaxReturnStatus.ReadyForSignature,
  TaxReturnStatus.InvoiceSent,
  TaxReturnStatus.BankProduct,
  TaxReturnStatus.Filed,
  TaxReturnStatus.Rejected,
  TaxReturnStatus.Accepted
];

interface Announcement {
  id: string;
  firm_id: string;
  type: 'client' | 'firm';
  title: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

const StatCard = ({ title, value, emoji, color, draggable, onDragStart, onDragOver, onDrop, onDragEnd, onDelete, compact, newCount }: any) => (
  <div
    draggable={draggable}
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onDragEnd={onDragEnd}
    className={`bg-white rounded-2xl border-white shadow-sm transition-all hover:border-brand hover:shadow-md group relative flex flex-col justify-center ${compact ? 'p-3 min-h-[80px] border-2' : 'p-4 border-[5px] min-h-[100px]'} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
  >
    {newCount > 0 && (
      <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-brand text-white text-[10px] font-black rounded-full shadow-md z-10 animate-in fade-in zoom-in duration-300">
        +{newCount}
      </span>
    )}
    {draggable && (
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded transition-colors"
          title="Remove from Dashboard"
        >
          <Trash2 size={12} />
        </button>
        <GripVertical size={14} className="text-slate-300" />
      </div>
    )}
    <div className="flex items-center gap-3">
      <div className={`${compact ? 'w-8 h-8 text-lg' : 'w-10 h-10 text-xl'} rounded-xl ${color} flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform shrink-0`}>
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold text-slate-400 uppercase tracking-widest leading-tight break-words mb-1 transition-colors`} title={title}>
          {title}
        </p>
        <h3 className={`${compact ? 'text-lg' : 'text-xl'} font-black text-slate-800 leading-none transition-colors`}>{value}</h3>
      </div>
    </div>
  </div>
);

const StatusStepper = ({ currentStatus, paymentType, isClientWorkspace }: { currentStatus: TaxReturnStatus, paymentType: string, isClientWorkspace: boolean }) => {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const isRejected = currentStatus === TaxReturnStatus.Rejected;
  const isAccepted = currentStatus === TaxReturnStatus.Accepted;

  const filteredStatusOrder = useMemo(() => {
    return STATUS_ORDER.filter(status => {
      if (isClientWorkspace && paymentType === 'Bank Product' && status === TaxReturnStatus.InvoiceSent) {
        return false;
      }
      return true;
    });
  }, [paymentType, isClientWorkspace]);

  return (
    <div className="space-y-4">
      {filteredStatusOrder.map((status, index) => {
        const statusIdx = STATUS_ORDER.indexOf(status);
        const isCompleted = statusIdx < currentIndex;
        const isActive = status === currentStatus;

        if (status === TaxReturnStatus.Rejected && isAccepted) return null;
        if (status === TaxReturnStatus.Accepted && isRejected) return null;

        return (
          <div key={status} className={`flex items-start gap-3 group transition-all ${isActive ? 'scale-105' : ''}`}>
            <div className="flex flex-col items-center">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isCompleted
                ? 'bg-brand border-brand text-white'
                : isActive
                  ? 'border-brand bg-white text-brand animate-pulse shadow-[0_0_12px_rgba(74,169,54,0.4)]'
                  : 'border-slate-200 bg-white text-slate-300'
                }`}>
                {isCompleted ? <CheckCircle size={12} /> : <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-brand' : 'bg-transparent'}`} />}
              </div>
              {index < filteredStatusOrder.length - 1 && (
                <div className={`w-0.5 h-6 my-1 transition-colors ${isCompleted ? 'bg-brand' : 'bg-slate-100'
                  }`} />
              )}
            </div>
            <div className="pt-0.5 flex items-center gap-2">
              <span className="text-sm">{STATUS_EMOJIS[status]}</span>
              <p className={`text-[11px] font-bold tracking-widest transition-all ${isActive ? 'text-brand animate-pulse scale-110 origin-left' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                }`}>
                {status.toUpperCase()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ role, returns, setReturns, selectedReturnId, setSelectedReturnId, refreshData, firmId, isExtension }) => {
  const isFirmOwner = role === UserRole.FirmOwner;
  const isManager = role === UserRole.Manager;
  const isTaxPro = role === UserRole.TaxPro;
  const isClient = role === UserRole.Client;
  const isStaff = isStaffRole(role);
  const canToggleView = isFirmOwner || isManager;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [clientTasks, setClientTasks] = useState<Task[]>([]);
  const [sortStatus, setSortStatus] = useState<string>('Default');
  const [filterYear, setFilterYear] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterPreparer, setFilterPreparer] = useState<string>('All');
  const [viewScope, setViewScope] = useState<'My' | 'Firm'>(isTaxPro ? 'My' : 'Firm');

  const [orderedStatuses, setOrderedStatuses] = useState<TaxReturnStatus[]>(() => {
    const saved = localStorage.getItem('firm_dashboard_layout');
    return saved ? JSON.parse(saved) : [...DEFAULT_DASHBOARD_STATUSES];
  });
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isLayoutDirty, setIsLayoutDirty] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('');
  const [tempFileName, setTempFileName] = useState('');

  // E-Signature Preparation States
  const [isPreparingFinalReturn, setIsPreparingFinalReturn] = useState(false);
  const [finalReturnFile, setFinalReturnFile] = useState<string | null>(null);
  const [signatureFields, setSignatureFields] = useState<{ id: number; x: number; y: number }[]>([]);
  const docPreviewRef = useRef<HTMLDivElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '', type: 'client' as 'client' | 'firm' });
  const [extensionStatusFilter, setExtensionStatusFilter] = useState<TaxReturnStatus>(TaxReturnStatus.IntakeReceived);

  // "New" badge tracking: compare current return IDs per status against last-visit snapshot
  const [prevSnapshot] = useState<Record<string, string[]> | null>(() => {
    try {
      const saved = localStorage.getItem('dashboard_status_snapshot');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const newCountsByStatus = useMemo(() => {
    if (!prevSnapshot || returns.length === 0) return {};
    const counts: Partial<Record<TaxReturnStatus, number>> = {};
    DEFAULT_DASHBOARD_STATUSES.forEach(status => {
      const currentIds = returns.filter(r => r.status === status).map(r => r.id);
      const prevIds = new Set(prevSnapshot[status] || []);
      const newCount = currentIds.filter(id => !prevIds.has(id)).length;
      if (newCount > 0) counts[status] = newCount;
    });
    return counts;
  }, [returns, prevSnapshot]);

  // Save current snapshot after user has seen the dashboard (3s delay)
  useEffect(() => {
    if (returns.length === 0) return;
    const timer = setTimeout(() => {
      const snapshot: Record<string, string[]> = {};
      DEFAULT_DASHBOARD_STATUSES.forEach(status => {
        snapshot[status] = returns.filter(r => r.status === status).map(r => r.id);
      });
      localStorage.setItem('dashboard_status_snapshot', JSON.stringify(snapshot));
    }, 3000);
    return () => clearTimeout(timer);
  }, [returns]);

  const groupedFileUploadTypes = useMemo(() => {
    const groups: Record<string, { key: string; label: string; category: string }[]> = {};
    Object.entries(FILE_UPLOAD_TYPES).forEach(([key, value]) => {
      if (!groups[value.category]) {
        groups[value.category] = [];
      }
      groups[value.category].push({ key, ...value });
    });
    return groups;
  }, []);

  const groupedReturnTypes = useMemo(() => {
    const groups: Record<string, { key: string; label: string; category: string }[]> = {};
    Object.entries(TAX_RETURN_TYPES).forEach(([key, value]) => {
      if (!groups[value.category]) {
        groups[value.category] = [];
      }
      groups[value.category].push({ key, ...value });
    });
    return groups;
  }, []);

  const staffName = useMemo(() => {
    if (isFirmOwner) return "Sarah Johnson";
    if (isManager) return "Marcus Aurelius";
    if (isTaxPro) return "David Smith";
    return "";
  }, [isFirmOwner, isManager, isTaxPro]);

  // Fetch actual staff members for the firm (for the Tax Pro filter)
  const [staffMembers, setStaffMembers] = useState<string[]>([]);
  useEffect(() => {
    if (!firmId || !isStaff) return;
    supabase
      .from('staff')
      .select('full_name')
      .eq('firm_id', firmId)
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          setStaffMembers(data.map((s: any) => s.full_name).filter(Boolean).sort());
        }
      });
  }, [firmId, isStaff]);

  const selectedReturn = returns.find(r => r.id === selectedReturnId);

  const displayedReturns = useMemo(() => {
    let base = [...returns];

    if (isTaxPro || (canToggleView && viewScope === 'My')) {
      base = base.filter(tr => tr.preparer === staffName);
    }

    if (filterPreparer !== 'All' && canToggleView) {
      base = base.filter(tr => tr.preparer === filterPreparer);
    }

    if (filterYear !== 'All') {
      base = base.filter(tr => tr.year === filterYear);
    }

    if (filterType !== 'All') {
      base = base.filter(tr => tr.type === filterType);
    }

    // Extension mode: filter by the status toggle selection
    if (isExtension) {
      base = base.filter(tr => tr.status === extensionStatusFilter);
    } else if (STATUS_ORDER.includes(sortStatus as TaxReturnStatus)) {
      base = base.filter(tr => tr.status === sortStatus);
    } else if (sortStatus === 'Workflow') {
      base.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    } else if (sortStatus === 'Client') {
      base.sort((a, b) => a.clientName.localeCompare(b.clientName));
    }

    return base;
  }, [returns, role, filterYear, filterType, filterPreparer, sortStatus, isTaxPro, canToggleView, viewScope, staffName, isExtension, extensionStatusFilter]);

  const statusCounts = useMemo(() => {
    const scopeReturns = (isTaxPro || (canToggleView && viewScope === 'My'))
      ? returns.filter(r => r.preparer === staffName)
      : returns;

    const counts: Partial<Record<TaxReturnStatus, number>> = {};
    DEFAULT_DASHBOARD_STATUSES.forEach(status => {
      counts[status] = scopeReturns.filter(r => r.status === status).length;
    });
    return counts;
  }, [returns, viewScope, staffName, isTaxPro, canToggleView]);

  const handleUpdateField = (id: string, field: string, value: string) => {
    setReturns(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setSaveStatus('idle');
  };

  const handleSaveCase = async () => {
    if (!selectedReturn) return;
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      // 1. Update Supabase
      const { error } = await supabase
        .from('clients')
        .update({
          tax_return_status: selectedReturn.status,
          assigned_to: selectedReturn.preparer || null,
          return_type: selectedReturn.type || null,
          tax_year: selectedReturn.year || null,
          agi: selectedReturn.agi || null,
          federal_balance: selectedReturn.federalBalance || null,
          state_balance: selectedReturn.stateBalance || null,
          payment_type: selectedReturn.paymentType || null,
          internal_notes: selectedReturn.internalNotes || null,
          updated_at: new Date().toISOString()
        })
        .eq('client_id', selectedReturn.id);

      if (error) throw error;

      // 2. Trigger GHL Sync via Edge Function
      // Fire and forget (don't block UI on this)
      supabase.functions.invoke('crm-update', {
        body: {
          clientId: selectedReturn.id,
          status: selectedReturn.status,
          firmId: firmId
        }
      });

      setSaveStatus('success');

      // Refresh local data
      await refreshData();

    } catch (err) {
      console.error("Error saving case:", err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchAnnouncements = async () => {
    if (!firmId) return;
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error("Failed to fetch announcements:", error);
    }
    if (data) setAnnouncements(data);
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [firmId]);

  // Client tasks fetch (RLS auto-scopes to tasks assigned to the logged-in client)
  const fetchClientTasks = async () => {
    if (!firmId) return;
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false });
    if (error) console.error('Failed to fetch client tasks:', error);
    if (data) setClientTasks(data);
  };

  useEffect(() => {
    if (isClient && firmId) fetchClientTasks();
  }, [firmId, isClient]);

  const handleToggleClientTask = async (task: Task) => {
    const nowCompleted = !task.is_completed;
    const { error } = await supabase
      .from('tasks')
      .update({
        is_completed: nowCompleted,
        completed_at: nowCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('task_id', task.task_id);
    if (!error) {
      setClientTasks(prev =>
        prev.map(t =>
          t.task_id === task.task_id
            ? { ...t, is_completed: nowCompleted, completed_at: nowCompleted ? new Date().toISOString() : undefined }
            : t
        )
      );
    }
  };

  const handleSaveAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.content || !firmId) return;
    setIsSavingAnnouncement(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('announcements').insert({
        firm_id: firmId,
        type: newAnnouncement.type,
        title: newAnnouncement.title,
        content: newAnnouncement.content,
        created_by: userData.user?.id || null,
      });
      if (error) throw error;
      setShowAnnouncementForm(false);
      setNewAnnouncement({ title: '', content: '', type: 'client' });
      await fetchAnnouncements();
    } catch (err: any) {
      console.error("Failed to save announcement:", err);
      alert(err?.message || 'Failed to save announcement. Check that the announcements table exists.');
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (!error) setAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  useEffect(() => {
    if (saveStatus === 'success') {
      const timer = setTimeout(() => setSaveStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const handleFileUpload = async () => {
    if (!selectedDocType || !tempFileName || !selectedReturnId || !firmId) return;

    // Find the file input element to get the actual file object
    const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (!file) {
      alert("No file selected");
      return;
    }

    setIsUploading(true); // Ensure loading state

    try {
      await uploadDocument(file, selectedReturnId, firmId, selectedDocType);

      // Refresh data to show new file
      await refreshData();

      setTempFileName('');
      setSelectedDocType('');
      setIsUploading(false);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload document. Please try again.");
      setIsUploading(false);
    }
  };

  const handleFinalReturnUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFinalReturnFile(file.name);
      setSignatureFields([]);
    }
  };

  const handleAddSignatureField = (e: React.MouseEvent) => {
    if (!docPreviewRef.current || !finalReturnFile) return;
    const rect = docPreviewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setSignatureFields(prev => [...prev, { id: Date.now(), x, y }]);
  };

  const handleRequestFinalSignature = () => {
    if (!finalReturnFile || !selectedReturnId) return;

    const newFile = {
      name: `FINAL - ${finalReturnFile}`,
      size: '3.8 MB',
      type: 'PDF',
      status: 'Uploaded' as DocStatus,
      signatureStatus: 'Pending' as const,
      uploadDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    };

    setReturns(prev => prev.map(r =>
      r.id === selectedReturnId
        ? { ...r, status: TaxReturnStatus.ReadyForSignature, files: [newFile, ...r.files] }
        : r
    ));

    setFinalReturnFile(null);
    setSignatureFields([]);
    setIsPreparingFinalReturn(false);
  };

  const handleRequestSignature = (returnId: string, fileName: string) => {
    setReturns(prev => prev.map(r => {
      if (r.id === returnId) {
        return {
          ...r,
          files: r.files.map(f => {
            if (f.name === fileName) {
              const current = f.signatureStatus || 'None';
              return {
                ...f,
                signatureStatus: current === 'None' ? 'Pending' : 'None'
              };
            }
            return f;
          })
        };
      }
      return r;
    }));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isFirmOwner) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    const target = e.target as HTMLElement;
    setTimeout(() => {
      target.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.style.opacity = '1';
    setDraggedIndex(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isFirmOwner) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (!isFirmOwner || draggedIndex === null) return;
    e.preventDefault();

    const newList = [...orderedStatuses];
    const draggedItem = newList[draggedIndex];
    newList.splice(draggedIndex, 1);
    newList.splice(targetIndex, 0, draggedItem);

    setOrderedStatuses(newList);
    setDraggedIndex(null);
    setIsLayoutDirty(true);
  };

  const handleDeleteStatus = (index: number) => {
    const newList = [...orderedStatuses];
    newList.splice(index, 1);
    setOrderedStatuses(newList);
    setIsLayoutDirty(true);
  };

  const handleResetStatuses = () => {
    setOrderedStatuses([...DEFAULT_DASHBOARD_STATUSES]);
    setIsLayoutDirty(true);
  };

  const handleSaveDashboardLayout = async () => {
    setIsSavingLayout(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      localStorage.setItem('firm_dashboard_layout', JSON.stringify(orderedStatuses));
      setIsLayoutDirty(false);
    } catch (err) {
      console.error("Failed to save dashboard layout:", err);
    } finally {
      setIsSavingLayout(false);
    }
  };

  const getStatCardProps = (status: TaxReturnStatus) => {
    const config: Record<TaxReturnStatus, { title: string; color: string }> = {
      [TaxReturnStatus.IntakeReceived]: { title: 'Intake Received', color: 'bg-blue-50 text-blue-600' },
      [TaxReturnStatus.MissingDocuments]: { title: 'Missing Docs', color: 'bg-rose-50 text-rose-600' },
      [TaxReturnStatus.ComplianceReview]: { title: 'Review', color: 'bg-indigo-50 text-indigo-600' },
      [TaxReturnStatus.InvoiceSent]: { title: 'Invoice Sent', color: 'bg-emerald-50 text-emerald-600' },
      [TaxReturnStatus.InPreparation]: { title: 'In Preparation', color: 'bg-slate-50 text-slate-600' },
      [TaxReturnStatus.ReadyForSignature]: { title: 'Ready for Sign', color: 'bg-purple-50 text-purple-600' },
      [TaxReturnStatus.Filed]: { title: 'Filed', color: 'bg-cyan-50 text-cyan-600' },
      [TaxReturnStatus.Accepted]: { title: 'Accepted', color: 'bg-amber-50 text-amber-600' },
      [TaxReturnStatus.Rejected]: { title: 'Rejected', color: 'bg-red-50 text-red-600' },
      [TaxReturnStatus.BankProduct]: { title: 'Bank Product', color: 'bg-slate-50 text-slate-600' },
    };
    return config[status];
  };

  if (selectedReturn) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex items-center gap-4 mb-2">
          <button
            onClick={() => setSelectedReturnId(null)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{selectedReturn.year} {selectedReturn.type}</h2>
            <p className="text-sm text-slate-500">Return ID: {selectedReturn.id} • {selectedReturn.clientName}</p>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${isExtension ? '' : 'lg:grid-cols-3'} gap-6`}>
          <div className={`${isExtension ? 'col-span-1' : 'lg:col-span-2'} space-y-4`}>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">Return Documents</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-medium">{selectedReturn.files.length} Files</span>
                  {(isClient || isStaff) && (
                    <button
                      onClick={() => setIsUploading(!isUploading)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 transition-all shadow-sm"
                    >
                      {isUploading ? <X size={14} /> : <Upload size={14} />}
                      {isUploading ? "Cancel" : "Upload New"}
                    </button>
                  )}
                </div>
              </div>

              {(isClient || isStaff) && isUploading && (
                <div className={`${isExtension ? 'p-3' : 'p-6'} bg-brand-light/40 border-b border-brand/10 animate-in slide-in-from-top-2 duration-300`}>
                  <div className={`${isExtension ? 'w-full' : 'max-w-xl'} mx-auto space-y-4`}>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Categorize Document</label>
                        <select
                          value={selectedDocType}
                          onChange={(e) => setSelectedDocType(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all shadow-sm"
                        >
                          <option value="">-- Select Document Category --</option>
                          {Object.entries(groupedFileUploadTypes).map(([category, items]) => (
                            <optgroup key={category} label={category}>
                              {(items as any[]).map(item => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:bg-white hover:border-brand/40 transition-all text-center group">
                        <input
                          type="file"
                          id="file-upload-input"
                          onChange={(e) => setTempFileName(e.target.files?.[0]?.name || '')}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="space-y-2">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 group-hover:text-brand transition-colors">
                            <Plus size={20} />
                          </div>
                          <p className="text-xs font-bold text-slate-600">
                            {tempFileName ? tempFileName : "Click or drag to select file"}
                          </p>
                          <p className="text-[10px] text-slate-400">PDF, PNG, or JPG accepted</p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleFileUpload}
                      disabled={!selectedDocType || !tempFileName}
                      className="w-full py-2.5 bg-brand text-white text-sm font-bold rounded-xl hover:bg-brand/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={16} />
                      Complete Upload
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-50">
                {selectedReturn.files.length > 0 ? selectedReturn.files.map((file, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-brand-light group-hover:text-brand transition-colors relative">
                        <FileCode size={20} />
                        {file.signatureStatus === 'Pending' && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white"></div>
                        )}
                        {file.signatureStatus === 'Signed' && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                          {file.signatureStatus === 'Pending' && (
                            <span className="text-[9px] font-black uppercase tracking-tighter bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">Signature Requested</span>
                          )}
                          {file.signatureStatus === 'Signed' && (
                            <span className="text-[9px] font-black uppercase tracking-tighter bg-brand-light text-brand px-1.5 py-0.5 rounded border border-brand/10">Signed</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">{file.type} • {file.size}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isStaff && (
                        <button
                          onClick={() => handleRequestSignature(selectedReturn.id, file.name)}
                          className={`p-2 rounded-lg transition-all ${file.signatureStatus === 'Pending' ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:text-brand hover:bg-brand-light'}`}
                          title={file.signatureStatus === 'Pending' ? "Cancel Signature Request" : "Request Client Signature"}
                        >
                          <PenTool size={18} />
                        </button>
                      )}
                      <button className="p-2 text-slate-400 hover:text-brand hover:bg-brand-light rounded-lg transition-all">
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-400 text-sm">No files uploaded for this return yet.</div>
                )}
              </div>
            </div>

            {/* Staff Internal Notes & Final Return Section */}
            {isStaff && (
              <>
                {/* Staff Internal Notes */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <StickyNote size={16} className="text-amber-500" />
                      Staff Internal Notes
                    </h3>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Hidden from Client</span>
                  </div>
                  <textarea
                    value={selectedReturn.internalNotes || ''}
                    onChange={(e) => handleUpdateField(selectedReturn.id, 'internalNotes', e.target.value)}
                    placeholder="Type confidential internal notes about this return case here... (e.g. 'Waiting on client to confirm spouse SSN')"
                    className="w-full min-h-[120px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-brand outline-none transition-all resize-none shadow-inner"
                  />
                </div>

                {/* Completed Return & Signature Boxes */}
                <div className="bg-white rounded-2xl border-[4px] border-dotted border-brand shadow-sm overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <FileCheck size={16} className="text-emerald-500" />
                      Final Return & E-Sign Request
                    </h3>
                    <button
                      onClick={() => setIsPreparingFinalReturn(!isPreparingFinalReturn)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm ${isPreparingFinalReturn ? 'bg-slate-200 text-slate-600' : 'bg-brand text-white hover:opacity-90'
                        }`}
                    >
                      {isPreparingFinalReturn ? <X size={14} /> : <Plus size={14} />}
                      {isPreparingFinalReturn ? "Cancel" : "Upload Final Return"}
                    </button>
                  </div>

                  {isPreparingFinalReturn && (
                    <div className="p-6 bg-emerald-50/30 animate-in slide-in-from-top-2 duration-300">
                      {!finalReturnFile ? (
                        <div className="max-w-xl mx-auto py-8">
                          <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-200 rounded-3xl p-10 hover:bg-white hover:border-emerald-400 transition-all cursor-pointer group bg-emerald-50/50">
                            <Upload size={32} className="text-emerald-400 group-hover:scale-110 transition-transform mb-3" />
                            <span className="text-sm font-bold text-slate-600">Select Completed PDF Return</span>
                            <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Client will receive this for signature</span>
                            <input type="file" className="hidden" accept=".pdf" onChange={handleFinalReturnUpload} />
                          </label>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                <FileText size={18} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-800">{finalReturnFile}</p>
                                <p className="text-[10px] text-slate-400 uppercase font-black">Ready for signature placement</p>
                              </div>
                            </div>
                            <button onClick={() => setFinalReturnFile(null)} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg transition-colors">
                              <X size={18} />
                            </button>
                          </div>

                          <div className={`grid grid-cols-1 ${isExtension ? 'gap-4' : 'md:grid-cols-4 gap-4'}`}>
                            <div className={`${isExtension ? 'col-span-1' : 'md:col-span-1'} space-y-4`}>
                              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">E-Sign Fields</h4>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-xl text-emerald-600 cursor-move hover:bg-emerald-100 transition-colors">
                                    <MousePointer2 size={14} />
                                    <span className="text-xs font-bold">Signature Box</span>
                                  </div>
                                  <p className="text-[9px] text-slate-400 leading-tight">Click on the document area to place a signature box.</p>
                                </div>
                              </div>

                              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Placed Fields</h4>
                                <div className="space-y-1">
                                  {signatureFields.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 italic">None placed yet.</p>
                                  ) : (
                                    signatureFields.map((field, idx) => (
                                      <div key={field.id} className="flex items-center justify-between text-[10px] font-bold text-slate-600 bg-slate-50 p-1.5 rounded">
                                        <span>Signature #{idx + 1}</span>
                                        <button onClick={() => setSignatureFields(prev => prev.filter(f => f.id !== field.id))} className="text-rose-400 hover:text-rose-600">
                                          <X size={10} />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className={`${isExtension ? 'col-span-1' : 'md:col-span-3'}`}>
                              <div
                                ref={docPreviewRef}
                                onClick={handleAddSignatureField}
                                className="aspect-[1/1.4] bg-slate-200/50 rounded-2xl border-2 border-slate-200 relative overflow-hidden shadow-inner flex flex-col items-center justify-center group cursor-crosshair"
                              >
                                <div className="absolute inset-0 flex items-center justify-center opacity-10 group-hover:opacity-20 transition-opacity">
                                  <FileText size={120} />
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 z-10 pointer-events-none">Document Preview Area</p>
                                <p className="text-[9px] text-slate-400 z-10 pointer-events-none">Click to drop signature marker</p>

                                {signatureFields.map((field, idx) => (
                                  <div
                                    key={field.id}
                                    style={{ left: `${field.x}%`, top: `${field.y}%` }}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 bg-emerald-500/90 text-white px-2 py-1 rounded shadow-lg flex items-center gap-1.5 border border-white z-20 group/sig"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Hand size={10} />
                                    <span className="text-[9px] font-black uppercase tracking-tighter">Sign Here</span>
                                    <button
                                      onClick={() => setSignatureFields(prev => prev.filter(f => f.id !== field.id))}
                                      className="ml-1 opacity-0 group-hover/sig:opacity-100 transition-opacity"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end pt-4 border-t border-emerald-100">
                            <button
                              onClick={handleRequestFinalSignature}
                              disabled={signatureFields.length === 0}
                              className="px-8 py-3 bg-brand text-white text-sm font-black rounded-xl hover:opacity-90 transition-all shadow-lg disabled:opacity-50 disabled:grayscale flex items-center gap-2"
                            >
                              <PenTool size={18} />
                              Finalize & Send to Client
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {isStaff && (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6 relative">
                <h3 className="text-sm font-bold text-slate-800 border-b border-slate-50 pb-2 flex items-center gap-2">
                  <Settings size={16} className="text-brand" />
                  Staff Internal Controls
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Update Return Status</label>
                    <select
                      value={selectedReturn.status}
                      onChange={(e) => handleUpdateField(selectedReturn.id, 'status', e.target.value as TaxReturnStatus)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                    >
                      {STATUS_ORDER.map(status => (
                        <option key={status} value={status}>{STATUS_EMOJIS[status]} {status}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Assigned Staff</label>
                    <select
                      value={selectedReturn.preparer || ''}
                      onChange={(e) => handleUpdateField(selectedReturn.id, 'preparer', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                    >
                      <option value="">-- Unassigned --</option>
                      {staffMembers.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Tax Return Type</label>
                    <select
                      value={Object.entries(TAX_RETURN_TYPES).find(([_, v]) => v.label === selectedReturn.type)?.[0] || ""}
                      onChange={(e) => {
                        const typeKey = e.target.value;
                        if (TAX_RETURN_TYPES[typeKey]) {
                          handleUpdateField(selectedReturn.id, 'type', TAX_RETURN_TYPES[typeKey].label);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                    >
                      <option value="">-- Select Return Type --</option>
                      {Object.entries(groupedReturnTypes).map(([category, items]) => (
                        <optgroup key={category} label={category}>
                          {(items as any[]).map(item => (
                            <option key={item.key} value={item.label}>{item.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Payment Type</label>
                    <div className="relative">
                      <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <select
                        value={selectedReturn.paymentType || "Invoice"}
                        onChange={(e) => handleUpdateField(selectedReturn.id, 'paymentType', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                      >
                        <option value="Invoice">Invoice</option>
                        <option value="Bank Product">Bank Product</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">AGI (Adjusted Gross Income)</label>
                    <input
                      type="text"
                      value={selectedReturn.agi}
                      onChange={(e) => handleUpdateField(selectedReturn.id, 'agi', e.target.value)}
                      placeholder="$0.00"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Federal Tax Refund/Balance Due</label>
                    <input
                      type="text"
                      value={selectedReturn.federalBalance}
                      onChange={(e) => handleUpdateField(selectedReturn.id, 'federalBalance', e.target.value)}
                      placeholder="$0.00 Refund / Due"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">State Refund/Balance Due</label>
                    <input
                      type="text"
                      value={selectedReturn.stateBalance}
                      onChange={(e) => handleUpdateField(selectedReturn.id, 'stateBalance', e.target.value)}
                      placeholder="$0.00 Refund / Due"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                  {saveStatus === 'success' ? (
                    <div className="flex items-center gap-2 text-[#4aa936] text-xs font-bold animate-in fade-in slide-in-from-left-2 duration-300">
                      <CheckCircle size={16} />
                      Return updated successfully.
                    </div>
                  ) : saveStatus === 'error' ? (
                    <div className="flex items-center gap-2 text-rose-500 text-xs font-bold animate-in fade-in slide-in-from-left-2 duration-300">
                      <AlertCircle size={16} />
                      Failed to sync with CRM.
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 font-medium">Changes auto-saved locally. Press Update to sync.</div>
                  )}

                  <button
                    onClick={handleSaveCase}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-8 py-3 bg-brand text-white text-sm font-bold rounded-xl hover:bg-brand/90 transition-all shadow-md disabled:opacity-70 ${isSaving ? 'cursor-wait' : 'cursor-pointer'}`}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Update Return
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-lg space-y-8 animate-in fade-in zoom-in-95 duration-700 overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-brand opacity-10"></div>

              <h3 className="text-xl font-extrabold text-slate-800 text-center tracking-tight leading-tight">
                {isClient ? "Where Is My Tax Return?" : "Return Summary & Stages"}
              </h3>

              {isClient && (
                <div className="grid grid-cols-1 gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-brand-light text-brand flex items-center justify-center">
                        <DollarSign size={14} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">AGI:</span>
                    </div>
                    <span className="text-sm font-black text-slate-800">{selectedReturn.agi}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Landmark size={14} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Federal:</span>
                    </div>
                    <span className={`text-sm font-black ${selectedReturn.federalBalance?.toLowerCase().includes('refund') ? 'text-brand' : 'text-rose-500'}`}>
                      {selectedReturn.federalBalance}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Wallet size={14} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">State:</span>
                    </div>
                    <span className={`text-sm font-black ${selectedReturn.stateBalance?.toLowerCase().includes('refund') ? 'text-brand' : 'text-rose-500'}`}>
                      {selectedReturn.stateBalance}
                    </span>
                  </div>
                </div>
              )}

              <div className="px-2">
                <StatusStepper
                  currentStatus={selectedReturn.status}
                  paymentType={selectedReturn.paymentType || 'Invoice'}
                  isClientWorkspace={isClient}
                />
              </div>

              <div className="pt-6 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={14} /> Last Updated
                  </span>
                  <span className="text-xs font-bold text-slate-700">{selectedReturn.date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                    <User size={14} /> Assigned Pro
                  </span>
                  <span className="text-xs font-bold text-slate-700">{selectedReturn.preparer}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {isStaff && !isExtension && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={20} className="text-brand" />
                Real-time Return Stats
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {canToggleView && (
                <div className="bg-slate-200/50 p-1 rounded-xl flex items-center shadow-inner border border-slate-200">
                  <button
                    onClick={() => setViewScope('My')}
                    className={`flex items-center gap-2 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewScope === 'My' ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    <Briefcase size={14} />
                    My Returns
                  </button>
                  <button
                    onClick={() => setViewScope('Firm')}
                    className={`flex items-center gap-2 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${viewScope === 'Firm' ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    <Users size={14} />
                    Firm Count
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {orderedStatuses.length > 0 ? orderedStatuses.map((status, index) => {
                const cardData = getStatCardProps(status);
                if (!cardData) return null;

                return (
                  <StatCard
                    key={status}
                    title={cardData.title}
                    value={(statusCounts[status] || 0).toString()}
                    emoji={STATUS_EMOJIS[status]}
                    color={cardData.color}
                    draggable={isFirmOwner}
                    onDragStart={(e: any) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e: any) => handleDrop(e, index)}
                    onDelete={() => handleDeleteStatus(index)}
                    newCount={newCountsByStatus[status] || 0}
                  />
                );
              }) : (
                <div className="col-span-full py-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                  <p className="text-xs font-bold text-slate-400 mb-2">Dashboard cards removed.</p>
                  <button
                    onClick={handleResetStatuses}
                    className="text-xs font-black text-brand underline"
                  >
                    Reset to show default cards
                  </button>
                </div>
              )}
            </div>

            {/* Layout Controls - Moved underneath cards on the right */}
            {isFirmOwner && (
              <div className="flex justify-end gap-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-500">
                <button
                  onClick={handleResetStatuses}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded-lg hover:bg-slate-200 transition-all"
                >
                  <RotateCcw size={12} /> Reset
                </button>
                <button
                  onClick={handleSaveDashboardLayout}
                  disabled={isSavingLayout || !isLayoutDirty}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-brand text-white text-[10px] font-bold uppercase rounded-lg hover:bg-brand/90 transition-all shadow-md disabled:opacity-50"
                >
                  {isSavingLayout ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save Layout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isExtension && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Megaphone size={14} className="text-brand" />
              <h4 className="text-xs font-bold text-slate-800">Announcements</h4>
            </div>
            {isFirmOwner && (
              <button
                onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
                className="p-1 bg-brand-light text-brand rounded-md hover:bg-brand hover:text-white transition-all"
              >
                {showAnnouncementForm ? <X size={12} /> : <BellPlus size={12} />}
              </button>
            )}
          </div>

          {isFirmOwner && showAnnouncementForm && (
            <div className="p-3 bg-brand-light/30 border-b border-brand/10 space-y-2 animate-in slide-in-from-top-2 duration-300">
              <input
                type="text"
                placeholder="Title"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none"
              />
              <textarea
                placeholder="Write message..."
                rows={2}
                value={newAnnouncement.content}
                onChange={(e) => setNewAnnouncement(prev => ({ ...prev, content: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-slate-600 focus:ring-2 focus:ring-brand outline-none resize-none"
              />
              <select
                value={newAnnouncement.type}
                onChange={(e) => setNewAnnouncement(prev => ({ ...prev, type: e.target.value as 'client' | 'firm' }))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600"
              >
                <option value="client">Client Announcement</option>
                <option value="firm">Firm Announcement</option>
              </select>
              <button
                onClick={handleSaveAnnouncement}
                disabled={isSavingAnnouncement || !newAnnouncement.title}
                className="w-full py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {isSavingAnnouncement ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Post
              </button>
            </div>
          )}

          <div className="max-h-[140px] overflow-y-auto">
            {announcements
              .filter(item => isClient ? item.type === 'client' : true)
              .slice(0, 3)
              .map((item) => (
              <div key={item.id} className="px-3 py-2 border-b border-slate-50 last:border-0 group relative">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    item.type === 'firm'
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {item.type === 'firm' ? 'Firm' : 'Client'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-400">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                    {isFirmOwner && (
                      <button
                        onClick={() => handleDeleteAnnouncement(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-rose-500 transition-all"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                </div>
                <h5 className="text-[11px] font-bold text-slate-700">{item.title}</h5>
                <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">{item.content}</p>
              </div>
            ))}
            {announcements.filter(item => isClient ? item.type === 'client' : true).length === 0 && (
              <p className="text-[10px] text-slate-400 text-center py-4">No announcements yet.</p>
            )}
          </div>
        </div>
      )}

      {isStaff && isExtension && (
        // Extension: status + year filters side-by-side
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand pointer-events-none" />
            <select
              value={extensionStatusFilter}
              onChange={(e) => setExtensionStatusFilter(e.target.value as TaxReturnStatus)}
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand/20 transition-all appearance-none cursor-pointer shadow-sm"
            >
              {orderedStatuses.map((status) => {
                const cardData = getStatCardProps(status);
                if (!cardData) return null;
                return (
                  <option key={status} value={status}>
                    {STATUS_EMOJIS[status]} {cardData.title} ({statusCounts[status] || 0})
                  </option>
                );
              })}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand/20 transition-all appearance-none cursor-pointer shadow-sm"
            >
              <option value="All">All Years</option>
              {Object.values(TAX_YEARS).map(y => (
                <option key={y.label} value={y.label}>{y.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isExtension ? '' : 'lg:grid-cols-3'} gap-8`}>
        <div className={`${isExtension ? 'col-span-1' : 'lg:col-span-2'} space-y-6`}>
          {isStaff ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`${isExtension ? 'p-3' : 'p-6'} border-b border-slate-100 space-y-3`}>
                <div>
                  <h4 className={`font-bold text-slate-800 ${isExtension ? 'text-sm' : ''}`}>
                    Workflow Management
                  </h4>
                  {!isExtension && (
                    <p className="text-xs text-slate-500 mt-1">
                      Filter and manage the status of your client tax returns.
                    </p>
                  )}
                </div>
                {!isExtension && (
                  <div className={`flex items-center gap-3 ${isTaxPro ? 'justify-center' : ''}`}>
                    <div className="relative flex items-center">
                      <Filter size={14} className="absolute left-3 text-slate-400" />
                      <select
                        value={sortStatus}
                        onChange={(e) => setSortStatus(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-brand/20 transition-all appearance-none cursor-pointer"
                      >
                        <option value="Default">All Workflow Stages</option>
                        {STATUS_ORDER.map(s => (
                          <option key={s} value={s}>{STATUS_EMOJIS[s]} {s}</option>
                        ))}
                        <hr className="my-1" />
                        <option value="Workflow">Sort: Workflow Order</option>
                        <option value="Client">Sort: Client Name</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="relative flex items-center">
                      <FileText size={14} className="absolute left-3 text-slate-400" />
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-brand/20 transition-all appearance-none cursor-pointer"
                      >
                        <option value="All">All Return Types</option>
                        {Object.entries(groupedReturnTypes).map(([category, items]) => (
                          <optgroup key={category} label={category}>
                            {(items as any[]).map(item => (
                              <option key={item.key} value={item.label}>{item.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="relative flex items-center">
                      <Calendar size={14} className="absolute left-3 text-slate-400" />
                      <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-brand/20 transition-all appearance-none cursor-pointer"
                      >
                        <option value="All">All Years</option>
                        {Object.values(TAX_YEARS).map(y => (
                          <option key={y.label} value={y.label}>{y.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 text-slate-400 pointer-events-none" />
                    </div>

                    {canToggleView && (
                      <div className="relative flex items-center">
                        <User size={14} className="absolute left-3 text-slate-400" />
                        <select
                          value={filterPreparer}
                          onChange={(e) => setFilterPreparer(e.target.value)}
                          className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-brand/20 transition-all appearance-none cursor-pointer"
                        >
                          <option value="All">All Staff</option>
                          {staffMembers.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 text-slate-400 pointer-events-none" />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className={isExtension ? 'overflow-hidden' : 'overflow-x-auto'}>
                {isExtension ? (
                  /* Extension: single-column clickable client list */
                  <div className="divide-y divide-slate-100">
                    {displayedReturns.length > 0 ? displayedReturns.map(tr => (
                      <button
                        key={tr.id}
                        onClick={() => setSelectedReturnId(tr.id)}
                        className="w-full flex items-center justify-between px-3 py-3 hover:bg-slate-50 transition-colors text-left group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate group-hover:text-brand transition-colors">{tr.clientName}</p>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter truncate">{tr.year} • {tr.type}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-brand shrink-0 ml-2 transition-colors" />
                      </button>
                    )) : (
                      <div className="px-3 py-8 text-center text-slate-400 text-sm">No returns found matching filters.</div>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Client & Return</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status Stage</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Assignee</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedReturns.length > 0 ? displayedReturns.map(tr => (
                        <tr key={tr.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">{tr.clientName}</p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter truncate">{tr.year} • {tr.type}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-brand-light text-brand border border-brand/10 shadow-sm">
                              <span className="text-xs">{STATUS_EMOJIS[tr.status]}</span>
                              {tr.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-medium text-slate-600">{tr.preparer}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedReturnId(tr.id)}
                              className="text-brand hover:underline text-xs font-bold"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">No returns found matching filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">Your Tax Returns</h4>
                </div>
              </div>

              <div className="space-y-4">
                {returns.map((tr) => (
                  <div
                    key={tr.id}
                    onClick={() => setSelectedReturnId(tr.id)}
                    className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-brand/30 cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-4 rounded-2xl ${tr.status === TaxReturnStatus.Accepted || tr.status === TaxReturnStatus.Filed ? 'bg-brand-light text-brand' : 'bg-amber-50 text-amber-500'}`}>
                        <FileText size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h5 className="font-bold text-slate-800">{tr.year} Tax Return</h5>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${tr.status === TaxReturnStatus.Accepted || tr.status === TaxReturnStatus.Filed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                            }`}>
                            {STATUS_EMOJIS[tr.status]} {tr.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">{tr.type}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-[10px] text-slate-400 font-medium">Prepared by {tr.preparer}</span>
                          <span className="text-[10px] text-slate-400 font-medium">•</span>
                          <span className="text-[10px] text-slate-400 font-medium">Updated {tr.date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-4 md:pt-0">
                      <div className="flex items-center gap-2">
                        <button
                          className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-brand hover:bg-brand-light font-semibold rounded-xl text-xs transition-all border border-slate-100 shadow-sm"
                        >
                          <Eye size={16} />
                          View Return
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Client Tasks Section */}
        {isClient && clientTasks.length > 0 && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CheckSquare size={18} className="text-brand" />
              <h4 className="font-bold text-slate-800">Your Tasks</h4>
            </div>

            {/* Incomplete tasks */}
            {clientTasks.filter(t => !t.is_completed).length > 0 && (
              <div className="mb-4">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  To Do
                  <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px]">
                    {clientTasks.filter(t => !t.is_completed).length}
                  </span>
                </h5>
                <div className="space-y-2">
                  {clientTasks.filter(t => !t.is_completed).map(task => (
                    <div
                      key={task.task_id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-brand/30 transition-all group"
                    >
                      <button
                        onClick={() => handleToggleClientTask(task)}
                        className="mt-0.5 text-slate-300 hover:text-brand transition-colors shrink-0"
                      >
                        <Circle size={18} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {task.due_date && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Calendar size={10} />
                              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                            task.priority === 'High' ? 'text-rose-500 bg-rose-50 border-rose-100'
                              : task.priority === 'Medium' ? 'text-amber-500 bg-amber-50 border-amber-100'
                              : 'text-slate-400 bg-slate-50 border-slate-100'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed tasks */}
            {clientTasks.filter(t => t.is_completed).length > 0 && (
              <div>
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Completed
                  <span className="ml-2 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px]">
                    {clientTasks.filter(t => t.is_completed).length}
                  </span>
                </h5>
                <div className="space-y-2">
                  {clientTasks.filter(t => t.is_completed).map(task => (
                    <div
                      key={task.task_id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50"
                    >
                      <button
                        onClick={() => handleToggleClientTask(task)}
                        className="mt-0.5 text-brand shrink-0"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-400 line-through">{task.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!isExtension && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Megaphone size={18} className="text-brand" />
                <h4 className="font-bold text-slate-800">Announcements</h4>
              </div>
              {isFirmOwner && (
                <button
                  onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
                  className="p-1.5 bg-brand-light text-brand rounded-lg hover:bg-brand hover:text-white transition-all"
                >
                  {showAnnouncementForm ? <X size={16} /> : <BellPlus size={16} />}
                </button>
              )}
            </div>

            {isFirmOwner && showAnnouncementForm && (
              <div className="mb-6 p-4 bg-brand-light/30 border border-brand/10 rounded-xl space-y-4 animate-in slide-in-from-top-2 duration-300">
                <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Type size={14} className="text-brand" /> New Announcement
                </h5>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Subject/Title"
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand outline-none"
                  />
                  <textarea
                    placeholder="Write message..."
                    rows={3}
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement(prev => ({ ...prev, content: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-brand outline-none resize-none"
                  />
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Type</label>
                      <select
                        value={newAnnouncement.type}
                        onChange={(e) => setNewAnnouncement(prev => ({ ...prev, type: e.target.value as 'client' | 'firm' }))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-brand outline-none"
                      >
                        <option value="client">Client Announcement</option>
                        <option value="firm">Firm Announcement</option>
                      </select>
                    </div>
                    <button
                      onClick={handleSaveAnnouncement}
                      disabled={isSavingAnnouncement || !newAnnouncement.title}
                      className="w-full py-2 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      {isSavingAnnouncement ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Post Announcement
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 flex-1 overflow-y-auto max-h-[600px] pr-1">
              {announcements
                .filter(item => isClient ? item.type === 'client' : true)
                .map((item) => (
                <div key={item.id} className="p-4 rounded-xl bg-slate-50/50 border border-slate-100 hover:border-brand/30 transition-all group relative overflow-hidden">
                  {item.type === 'firm' && (
                    <div className="absolute top-0 right-0 w-1 h-full bg-indigo-500"></div>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      item.type === 'firm'
                        ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    }`}>
                      {item.type === 'firm' ? 'Firm' : 'Client'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      {isFirmOwner && (
                        <button
                          onClick={() => handleDeleteAnnouncement(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 transition-all"
                          title="Delete announcement"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h5 className="text-sm font-bold text-slate-700 mb-1">{item.title}</h5>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.content}</p>
                </div>
              ))}
              {announcements.filter(item => isClient ? item.type === 'client' : true).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">No announcements yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


export default Dashboard;