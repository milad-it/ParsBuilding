import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Building3DHero } from '@/components/3d/login/Building3DComplex';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Building2, Phone, Lock, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC<{ onLoginSuccess?: () => void }> = ({ onLoginSuccess }) => {
  const { login, isLoading, error } = useAuthStore();
  const [phone, setPhone] = useState('09123456789');
  const [password, setPassword] = useState('password123');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!phone.trim()) {
      setValidationError('شماره همراه را وارد نمایید');
      return;
    }
    if (!password) {
      setValidationError('رمز عبور را وارد نمایید');
      return;
    }

    const success = await login(phone.trim(), password);
    if (success && onLoginSuccess) {
      onLoginSuccess();
    }
  };

  return (
    <div dir="rtl" className="flex min-h-screen w-full bg-slate-950 text-slate-100 font-sans">
      {/* 3D Visual Hero Panel (Desktop) */}
      <div className="hidden lg:relative lg:flex lg:flex-1 lg:flex-col lg:justify-between bg-slate-900 border-e border-slate-800 p-8 overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-glow-brand">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">پارس بیلدینگ</h2>
            <p className="text-xs text-brand-400">سامانه جامع مدیریت هوشمند مجتمع‌های مسکونی</p>
          </div>
        </div>

        {/* 3D High-Rise Building Tower */}
        <div className="absolute inset-0 z-0">
          <Building3DHero />
        </div>

        <div className="relative z-10 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 backdrop-blur-md max-w-sm">
          <p className="text-xs text-slate-300 leading-relaxed">
            محاسبه دقیق شارژ، تطبیق قانون تملک آپارتمان‌ها، تراز معین مالی و ارتباط زنده با ساکنین.
          </p>
        </div>
      </div>

      {/* Login Form Panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:flex-none lg:w-[480px]">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="text-right space-y-2">
            <div className="flex lg:hidden items-center gap-2 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-white">پارس بیلدینگ</span>
            </div>
            <h1 className="text-2xl font-black text-white">ورود به سامانه</h1>
            <p className="text-xs text-slate-400">
              جهت دسترسی به داشبورد مدیریت یا پرتال ساکنین وارد حساب خود شوید
            </p>
          </div>

          {(error || validationError) && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError || error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="شماره تلفن همراه"
              type="tel"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              iconStart={<Phone className="w-4 h-4" />}
              autoComplete="username"
              required
            />

            <Input
              label="رمز عبور"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              iconStart={<Lock className="w-4 h-4" />}
              autoComplete="current-password"
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              ورود به سیستم
            </Button>
          </form>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center text-xs text-slate-400">
            حساب آزمایشی مدیر: <span className="font-mono text-slate-200">09123456789</span> / <span className="font-mono text-slate-200">password123</span>
          </div>
        </div>
      </div>
    </div>
  );
};
