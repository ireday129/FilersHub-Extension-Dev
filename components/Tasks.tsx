
import React from 'react';
import { CheckCircle2, Circle, AlertTriangle, MoreHorizontal } from 'lucide-react';
import { Task } from '../types';

const Tasks: React.FC = () => {
  const tasks: Task[] = [
    { id: '1', title: 'Upload W-2 Forms', dueDate: 'Jan 31, 2024', status: 'Completed', priority: 'High' },
    { id: '2', title: 'Review 2023 Business Expenses', dueDate: 'Feb 15, 2024', status: 'In Progress', priority: 'High' },
    { id: '3', title: 'Schedule Final Review Meeting', dueDate: 'Mar 01, 2024', status: 'To Do', priority: 'Medium' },
    { id: '4', title: 'Sign E-file Authorization', dueDate: 'Apr 10, 2024', status: 'To Do', priority: 'High' },
    { id: '5', title: 'Pay Estimated Taxes for Q1', dueDate: 'Apr 15, 2024', status: 'To Do', priority: 'Low' },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'text-rose-500';
      case 'Medium': return 'text-amber-500';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['To Do', 'In Progress', 'Completed'].map((status) => (
          <div key={status} className="space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-slate-800 flex items-center gap-2">
                {status}
                <span className="text-xs font-normal bg-slate-200 px-2 py-0.5 rounded-full text-slate-600">
                  {tasks.filter(t => t.status === status).length}
                </span>
              </h5>
              <button className="text-slate-400 hover:text-slate-600">
                <MoreHorizontal size={18} />
              </button>
            </div>
            
            <div className="space-y-3">
              {tasks.filter(t => t.status === status).map((task) => (
                <div key={task.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:border-[#4aa936]/30 transition-colors cursor-pointer group">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-50 border border-slate-100 ${getPriorityColor(task.priority)}`}>
                      {task.priority} Priority
                    </span>
                    <button className="text-slate-300 group-hover:text-[#4aa936] transition-colors">
                      {status === 'Completed' ? <CheckCircle2 size={18} className="text-[#4aa936]" /> : <Circle size={18} />}
                    </button>
                  </div>
                  <h6 className="text-sm font-semibold text-slate-700 mb-4">{task.title}</h6>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1">
                      <AlertTriangle size={12} />
                      Due {task.dueDate}
                    </div>
                    <img 
                      src={`https://picsum.photos/seed/${task.id}/40/40`} 
                      alt="Assignee" 
                      className="w-5 h-5 rounded-full"
                    />
                  </div>
                </div>
              ))}
              <button className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm font-medium hover:border-[#4aa936]/40 hover:text-[#4aa936] transition-all">
                + Add Task
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tasks;
