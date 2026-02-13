import React, { useState, useMemo } from 'react';
import {
  FileText,
  Upload,
  Download,
  Eye,
  MoreVertical,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  X,
  Loader2,
  ListFilter,
  Briefcase,
  ChevronDown,
  Plus
} from 'lucide-react';
import { TaxDocument, UserRole, isStaffRole, DocStatus, TaxReturn, FILE_UPLOAD_TYPES } from '../types';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useExtensionMode } from '../hooks/useExtensionMode';

interface DocumentsProps {
  role: UserRole;
  returns: TaxReturn[];
  setReturns: React.Dispatch<React.SetStateAction<TaxReturn[]>>;
  firmId: string | null;
}

const Documents: React.FC<DocumentsProps> = ({ role, returns, setReturns, firmId }) => {
  const { user } = useAuth();
  const { isExtension } = useExtensionMode();
  const isStaff = isStaffRole(role);

  // States
  const [filterStatus, setFilterStatus] = useState<DocStatus | 'All'>(isStaff ? 'Uploaded' : 'All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReturnId, setSelectedReturnId] = useState<string | 'All'>(isStaff ? 'All' : (returns[0]?.id || ''));
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('');
  const [tempFileName, setTempFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Find the selected return object
  const selectedReturn = useMemo(() =>
    returns.find(r => r.id === selectedReturnId),
    [returns, selectedReturnId]
  );

  // Aggregated view of all documents from all returns for staff 'All' cases view
  const allDocuments = useMemo(() => {
    let docs: any[] = [];
    returns.forEach(ret => {
      ret.files.forEach(file => {
        docs.push({
          ...file,
          returnId: ret.id,
          returnName: `${ret.year} ${ret.type}`,
          clientName: ret.clientName,
          status: (file as any).status || 'Uploaded' // Ensure status exists, default to Uploaded if missing
        });
      });
    });
    return docs;
  }, [returns]);

  // Filtering Logic
  const filteredDocs = useMemo(() => {
    // Determine the base set of documents
    let base = selectedReturnId === 'All' ? allDocuments : allDocuments.filter(d => d.returnId === selectedReturnId);

    // Apply filters
    return base.filter(doc => {
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'All' || doc.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [allDocuments, searchQuery, filterStatus, selectedReturnId]);

  const stats = useMemo(() => {
    const base = selectedReturnId === 'All' ? allDocuments : allDocuments.filter(d => d.returnId === selectedReturnId);
    return {
      all: base.length,
      uploaded: base.filter(d => d.status === 'Uploaded').length,
      review: base.filter(d => d.status === 'Under Review').length,
      approved: base.filter(d => d.status === 'Approved').length,
      rejected: base.filter(d => d.status === 'Rejected').length,
    };
  }, [allDocuments, selectedReturnId]);

  const handleStatusChange = (returnId: string, fileName: string, newStatus: DocStatus) => {
    setReturns(prev => prev.map(ret => {
      if (ret.id === returnId) {
        return {
          ...ret,
          files: ret.files.map(f => f.name === fileName ? { ...f, status: newStatus } : f)
        };
      }
      return ret;
    }));
  };

  const handleFileUpload = async () => {
    if (!selectedDocType || !selectedFile || !selectedReturnId || selectedReturnId === 'All' || !firmId || !user) return;

    setIsUploading(true);
    const docInfo = FILE_UPLOAD_TYPES[selectedDocType];

    try {
      // 1. Upload to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = `${firmId}/${selectedReturnId}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL? No, it's a private bucket. We store the path.

      // 2. Insert into DB
      const { data: dbDoc, error: dbError } = await supabase
        .from('documents')
        .insert({
          firm_id: firmId,
          client_id: selectedReturnId,
          file_name: selectedFile.name,
          file_type: fileExt || 'unknown',
          file_size: selectedFile.size,
          file_url: filePath, // Storing storage path
          document_category: selectedDocType,
          uploaded_by: user.id,
          uploader_type: isStaff ? 'staff' : 'client'
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // 3. Optimistic UI Update
      const newFile = {
        name: selectedFile.name,
        size: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB',
        type: (fileExt || 'PDF').toUpperCase(),
        status: 'Uploaded' as DocStatus,
        uploadDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
      };

      setReturns(prev => prev.map(r =>
        r.id === selectedReturnId
          ? { ...r, files: [newFile, ...r.files] }
          : r
      ));

      setTempFileName('');
      setSelectedFile(null);
      setSelectedDocType('');
      setIsUploading(false);

    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload document. Please try again.');
      setIsUploading(false);
    }
  };

  const getStatusColor = (status: DocStatus) => {
    switch (status) {
      case 'Approved': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Under Review': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Rejected': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'Uploaded': return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  // Group FILE_UPLOAD_TYPES by category for the select dropdown
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Top Header: Target Case Selection */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white ${isExtension ? 'p-3' : 'p-6'} rounded-2xl border border-slate-100 shadow-sm`}>
        <div className="flex-1 min-w-0">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
            Current Tax Case Context
          </label>
          <div className={`relative ${isExtension ? 'w-full' : 'max-w-md'} group`}>
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-brand group-focus-within:scale-110 transition-transform" size={18} />
            <select
              value={selectedReturnId}
              onChange={(e) => {
                setSelectedReturnId(e.target.value);
                setIsUploading(false); // Reset upload state on case change
              }}
              className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-brand/10 outline-none transition-all appearance-none cursor-pointer"
            >
              {isStaff && <option value="All">All Active Firm Cases</option>}
              {returns.map(ret => (
                <option key={ret.id} value={ret.id}>
                  {ret.clientName} - {ret.year} {ret.type}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setFilterStatus('All')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${filterStatus === 'All' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            All <span className="text-[10px] opacity-60 font-medium">({stats.all})</span>
          </button>
          {(['Uploaded', 'Under Review', 'Approved', 'Rejected'] as DocStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${filterStatus === status ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {status} <span className="text-[10px] opacity-60 font-medium">({status === 'Uploaded' ? stats.uploaded : status === 'Under Review' ? stats.review : status === 'Approved' ? stats.approved : stats.rejected})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        {/* Table Header Controls */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white sticky top-0 z-10">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search documents by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsUploading(!isUploading)}
              disabled={selectedReturnId === 'All'}
              className="flex items-center gap-2 px-6 py-2 bg-brand text-white text-sm font-black rounded-xl hover:shadow-lg disabled:opacity-40 disabled:grayscale transition-all shadow-sm"
            >
              {/* Fix: X icon is now imported correctly */}
              {isUploading ? <X size={18} /> : <Upload size={18} />}
              {isUploading ? "Cancel Upload" : "Upload to Selected Case"}
            </button>
          </div>
        </div>

        {/* Inline Upload Form */}
        {isUploading && (
          <div className={`${isExtension ? 'p-3' : 'p-8'} bg-brand-light/40 border-b border-brand/10 animate-in slide-in-from-top-2 duration-300`}>
            <div className={`${isExtension ? 'w-full' : 'max-w-2xl'} mx-auto space-y-6`}>
              <div className="text-center mb-4">
                <h4 className="font-black text-slate-800">Add to Case: {selectedReturn?.clientName}</h4>
                <p className="text-xs text-slate-500">{selectedReturn?.year} {selectedReturn?.type}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        {/* Fix: Explicitly cast items to any[] to avoid 'unknown' type error during mapping */}
                        {(items as any[]).map(item => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Selected File</label>
                  <div className="relative group">
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedFile(file);
                          setTempFileName(file.name);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                    <div className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-400 group-hover:border-brand/50 transition-colors flex items-center justify-between">
                      <span className="truncate">{tempFileName || "Choose File..."}</span>
                      <Plus size={16} />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleFileUpload}
                disabled={!selectedDocType || !tempFileName}
                className="w-full py-3 bg-brand text-white text-sm font-black rounded-xl hover:bg-opacity-90 transition-all disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
              >
                {isUploading ? <Loader2 className="animate-spin" /> : "Confirm Upload to Case"}
              </button>
            </div>
          </div>
        )}

        <div className={`flex-1 ${isExtension ? 'overflow-hidden' : 'overflow-x-auto'}`}>
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10 shadow-sm">
              <tr>
                <th className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'} text-xs font-black text-slate-500 uppercase tracking-widest`}>Document & Case</th>
                <th className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'} text-xs font-black text-slate-500 uppercase tracking-widest`}>Status</th>
                {!isExtension && <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">Metadata</th>}
                <th className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'} text-xs font-black text-slate-500 uppercase tracking-widest text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.length > 0 ? filteredDocs.map((doc, idx) => (
                <tr key={`${doc.returnId}-${idx}`} className="hover:bg-slate-50 transition-colors group">
                  <td className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'}`}>
                    <div className="flex items-center gap-2">
                      {!isExtension && (
                        <div className="p-2.5 bg-brand-light text-brand rounded-xl group-hover:scale-110 transition-transform shadow-inner shrink-0">
                          <FileText size={20} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className={`${isExtension ? 'text-xs' : 'text-sm'} font-bold text-slate-700 truncate`}>{doc.name}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-tighter truncate">
                            {isExtension ? doc.returnName : `Case: ${doc.returnName}`}
                          </span>
                          {!isExtension && (
                            <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                              {doc.clientName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'}`}>
                    {isStaff ? (
                      <div className={`relative inline-block ${isExtension ? 'w-28' : 'w-40'}`}>
                        <select
                          value={doc.status}
                          onChange={(e) => handleStatusChange(doc.returnId, doc.name, e.target.value as DocStatus)}
                          className={`w-full appearance-none pl-2 pr-6 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer outline-none focus:ring-4 focus:ring-brand/10 ${getStatusColor(doc.status)}`}
                        >
                          <option value="Uploaded">Uploaded</option>
                          <option value="Under Review">Under Review</option>
                          <option value="Approved">Approved</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-50">
                          <ListFilter size={12} />
                        </div>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border ${getStatusColor(doc.status)}`}>
                        <Clock size={12} />
                        {doc.status}
                      </span>
                    )}
                  </td>
                  {!isExtension && (
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-xs text-slate-600 font-bold">{doc.uploadDate || 'Mar 15, 2024'}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase">{doc.size} • {doc.type}</p>
                      </div>
                    </td>
                  )}
                  <td className={`${isExtension ? 'px-3 py-3' : 'px-6 py-4'}`}>
                    <div className={`flex items-center justify-end gap-1 ${isExtension ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                      <button className={`${isExtension ? 'p-1.5' : 'p-2'} text-slate-400 hover:text-brand hover:bg-brand-light rounded-lg transition-all`} title="View">
                        <Eye size={isExtension ? 14 : 18} />
                      </button>
                      <button className={`${isExtension ? 'p-1.5' : 'p-2'} text-slate-400 hover:text-brand hover:bg-brand-light rounded-lg transition-all`} title="Download">
                        <Download size={isExtension ? 14 : 18} />
                      </button>
                      {!isExtension && (
                        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                          <MoreVertical size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={isExtension ? 3 : 4} className={`${isExtension ? 'py-16' : 'py-32'} text-center`}>
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200 mb-6 border-4 border-white shadow-inner">
                      <FileText size={40} />
                    </div>
                    <h3 className="text-lg font-black text-slate-700">No documents in this view</h3>
                    <p className="text-sm text-slate-400 mt-1">Select a different tax case or adjust your filters.</p>
                    {selectedReturnId === 'All' && isStaff && (
                      <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 max-w-sm mx-auto flex items-center gap-3 text-left">
                        <AlertCircle className="text-amber-500 shrink-0" size={20} />
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">
                          Note: Cross-case aggregation is only available for Staff roles to monitor firm-wide document flow.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {selectedReturnId === 'All' ? 'Showing Aggregated Firm Documents' : `Filtered by Case: ${selectedReturn?.id}`}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-black text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              Total Files: {filteredDocs.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Documents;