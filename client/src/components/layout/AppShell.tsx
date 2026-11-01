import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '@/components/common/Toast';

export interface AppShellProps {
  currentView: string;
  onNavigate: (viewId: string) => void;
  title: string;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ currentView, onNavigate, title, children }) => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-brand-500 selection:text-white">
      {/* Persian RTL Sidebar */}
      <Sidebar currentView={currentView} onNavigate={onNavigate} />

      {/* Main Workspace */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header currentTitle={title} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Floating System Toasts */}
      <ToastContainer />
    </div>
  );
};
