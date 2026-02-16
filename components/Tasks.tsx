import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Calendar,
  Trash2,
  Plus,
  X,
  Save,
  Loader2,
  Building2,
  Users,
  CheckSquare,
} from 'lucide-react';
import { Task, UserRole } from '../types';
import { supabase } from '../services/supabase';

interface TasksProps {
  firmId: string | null;
  role: UserRole;
  isExtension?: boolean;
}

const Tasks: React.FC<TasksProps> = ({ firmId, role, isExtension }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [clientList, setClientList] = useState<{ id: string; name: string }[]>([]);
  const [extensionTab, setExtensionTab] = useState<'firm' | 'client' | 'completed'>('firm');

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    type: 'firm' as 'firm' | 'client',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    assigned_to: '',
    due_date: '',
  });

  const isFirmOwner = role === UserRole.FirmOwner;
  const isManager = role === UserRole.Manager;
  const canCreate = isFirmOwner || isManager;

  // Fetch tasks
  const fetchTasks = async () => {
    if (!firmId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false });
    if (error) console.error('Failed to fetch tasks:', error);
    if (data) setTasks(data);
    setLoading(false);
  };

  // Fetch staff + clients for assignment
  useEffect(() => {
    if (!firmId) return;

    const fetchAssignees = async () => {
      const [staffRes, clientRes] = await Promise.all([
        supabase
          .from('staff')
          .select('staff_id, full_name')
          .eq('firm_id', firmId)
          .eq('is_active', true),
        supabase
          .from('clients')
          .select('client_id, full_name')
          .eq('firm_id', firmId)
          .eq('is_active', true),
      ]);

      if (staffRes.data) setStaffList(staffRes.data.map(s => ({ id: s.staff_id, name: s.full_name })));
      if (clientRes.data) setClientList(clientRes.data.map(c => ({ id: c.client_id, name: c.full_name })));
    };

    fetchAssignees();
  }, [firmId]);

  useEffect(() => {
    fetchTasks();
  }, [firmId]);

  // Create task
  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.assigned_to || !firmId) return;
    setCreating(true);

    const { data: userData } = await supabase.auth.getUser();
    const assigneeList = newTask.type === 'firm' ? staffList : clientList;
    const assigneeName = assigneeList.find(a => a.id === newTask.assigned_to)?.name || '';

    const { error } = await supabase.from('tasks').insert({
      firm_id: firmId,
      title: newTask.title,
      description: newTask.description || null,
      type: newTask.type,
      priority: newTask.priority,
      assigned_to: newTask.assigned_to,
      assigned_to_name: assigneeName,
      due_date: newTask.due_date || null,
      created_by: userData.user?.id || null,
    });

    if (error) {
      console.error('Failed to create task:', error);
      setCreating(false);
      return;
    }

    setShowCreateForm(false);
    setNewTask({ title: '', description: '', type: 'firm', priority: 'Medium', assigned_to: '', due_date: '' });
    setCreating(false);
    await fetchTasks();
  };

  // Toggle completion
  const handleToggleComplete = async (task: Task) => {
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
      setTasks(prev =>
        prev.map(t =>
          t.task_id === task.task_id
            ? { ...t, is_completed: nowCompleted, completed_at: nowCompleted ? new Date().toISOString() : undefined }
            : t
        )
      );
    }
  };

  // Delete completed task
  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase.from('tasks').delete().eq('task_id', taskId);
    if (!error) setTasks(prev => prev.filter(t => t.task_id !== taskId));
  };

  // Derived lists
  const firmTasks = tasks.filter(t => t.type === 'firm' && !t.is_completed);
  const clientTasks = tasks.filter(t => t.type === 'client' && !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'text-rose-500 bg-rose-50 border-rose-100';
      case 'Medium': return 'text-amber-500 bg-amber-50 border-amber-100';
      default: return 'text-slate-400 bg-slate-50 border-slate-100';
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Task card component
  const TaskCard: React.FC<{ task: Task; showType?: boolean; showDelete?: boolean }> = ({ task, showType, showDelete }) => (
    <div className={`bg-white ${isExtension ? 'p-3' : 'p-4'} rounded-xl border border-slate-100 shadow-sm hover:border-brand/30 transition-all group`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
            {task.priority}
          </span>
          {showType && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
              task.type === 'firm' ? 'text-indigo-500 bg-indigo-50 border-indigo-100' : 'text-emerald-500 bg-emerald-50 border-emerald-100'
            }`}>
              {task.type === 'firm' ? 'Firm' : 'Client'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {showDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.task_id); }}
              className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-0.5"
              title="Delete task"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => handleToggleComplete(task)}
            className="text-slate-300 hover:text-brand transition-colors"
          >
            {task.is_completed ? (
              <CheckCircle2 size={18} className="text-brand" />
            ) : (
              <Circle size={18} />
            )}
          </button>
        </div>
      </div>
      <h6 className={`text-sm font-semibold text-slate-700 mb-1 ${task.is_completed ? 'line-through text-slate-400' : ''}`}>
        {task.title}
      </h6>
      {task.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          {task.due_date && (
            <div className="flex items-center gap-1">
              <Calendar size={11} />
              {formatDate(task.due_date)}
            </div>
          )}
        </div>
        {task.assigned_to_name && (
          <span className="font-medium text-slate-500 truncate max-w-[120px]">{task.assigned_to_name}</span>
        )}
      </div>
    </div>
  );

  // Column component
  const TaskColumn = ({
    title,
    icon,
    accentColor,
    columnTasks,
    taskType,
    showType,
    showDelete,
  }: {
    title: string;
    icon: React.ReactNode;
    accentColor: string;
    columnTasks: Task[];
    taskType?: 'firm' | 'client';
    showType?: boolean;
    showDelete?: boolean;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="font-bold text-slate-800 flex items-center gap-2">
          {icon}
          {title}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${accentColor}`}>
            {columnTasks.length}
          </span>
        </h5>
      </div>

      <div className="space-y-3">
        {columnTasks.length === 0 ? (
          <div className="py-8 text-center text-slate-300 text-xs font-medium border-2 border-dashed border-slate-100 rounded-xl">
            No tasks
          </div>
        ) : (
          columnTasks.map(task => (
            <TaskCard key={task.task_id} task={task} showType={showType} showDelete={showDelete} />
          ))
        )}
        {canCreate && taskType && (
          <button
            onClick={() => {
              setNewTask(prev => ({ ...prev, type: taskType, assigned_to: '' }));
              setShowCreateForm(true);
            }}
            className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm font-medium hover:border-brand/40 hover:text-brand transition-all"
          >
            <Plus size={14} className="inline mr-1" />
            Add Task
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-brand" />
        <p className="text-sm font-medium">Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Create Task Form */}
      {showCreateForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-300">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h5 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Plus size={16} className="text-brand" />
              New Task
            </h5>
            <button
              onClick={() => setShowCreateForm(false)}
              className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
          <div className={`${isExtension ? 'p-3 space-y-3' : 'p-6 space-y-4'}`}>
            <input
              type="text"
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand focus:bg-white outline-none"
            />
            <textarea
              placeholder="Description (optional)"
              rows={2}
              value={newTask.description}
              onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-brand focus:bg-white outline-none resize-none"
            />
            <div className={`grid ${isExtension ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-4'}`}>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Type</label>
                <select
                  value={newTask.type}
                  onChange={(e) => setNewTask(prev => ({ ...prev, type: e.target.value as 'firm' | 'client', assigned_to: '' }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-brand outline-none"
                >
                  <option value="firm">Firm Task</option>
                  <option value="client">Client Task</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Assign To</label>
                <select
                  value={newTask.assigned_to}
                  onChange={(e) => setNewTask(prev => ({ ...prev, assigned_to: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-brand outline-none"
                >
                  <option value="">Select {newTask.type === 'firm' ? 'staff member' : 'client'}...</option>
                  {(newTask.type === 'firm' ? staffList : clientList).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value as 'Low' | 'Medium' | 'High' }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-brand outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask(prev => ({ ...prev, due_date: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-brand outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleCreateTask}
              disabled={creating || !newTask.title || !newTask.assigned_to}
              className="w-full py-2.5 bg-brand text-white text-sm font-bold rounded-xl hover:bg-brand/90 transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Create Task
            </button>
          </div>
        </div>
      )}

      {/* Header with create button */}
      {canCreate && !showCreateForm && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand/90 transition-colors shadow-sm"
          >
            <Plus size={16} />
            New Task
          </button>
        </div>
      )}

      {/* Extension: Tab switcher + single column */}
      {isExtension ? (
        <div>
          <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
            {([
              { key: 'firm' as const, label: 'Firm', count: firmTasks.length },
              { key: 'client' as const, label: 'Client', count: clientTasks.length },
              { key: 'completed' as const, label: 'Done', count: completedTasks.length },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setExtensionTab(tab.key)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  extensionTab === tab.key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {extensionTab === 'firm' && (
            <TaskColumn
              title="Firm Tasks"
              icon={<Building2 size={16} className="text-indigo-500" />}
              accentColor="bg-indigo-50 text-indigo-600"
              columnTasks={firmTasks}
              taskType="firm"
            />
          )}
          {extensionTab === 'client' && (
            <TaskColumn
              title="Client Tasks"
              icon={<Users size={16} className="text-emerald-500" />}
              accentColor="bg-emerald-50 text-emerald-600"
              columnTasks={clientTasks}
              taskType="client"
            />
          )}
          {extensionTab === 'completed' && (
            <TaskColumn
              title="Completed"
              icon={<CheckSquare size={16} className="text-slate-400" />}
              accentColor="bg-slate-100 text-slate-500"
              columnTasks={completedTasks}
              showType
              showDelete
            />
          )}
        </div>
      ) : (
        /* Desktop: 3-column grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <TaskColumn
            title="Firm"
            icon={<Building2 size={16} className="text-indigo-500" />}
            accentColor="bg-indigo-50 text-indigo-600"
            columnTasks={firmTasks}
            taskType="firm"
          />
          <TaskColumn
            title="Client"
            icon={<Users size={16} className="text-emerald-500" />}
            accentColor="bg-emerald-50 text-emerald-600"
            columnTasks={clientTasks}
            taskType="client"
          />
          <TaskColumn
            title="Completed"
            icon={<CheckSquare size={16} className="text-slate-400" />}
            accentColor="bg-slate-100 text-slate-500"
            columnTasks={completedTasks}
            showType
            showDelete
          />
        </div>
      )}
    </div>
  );
};

export default Tasks;
