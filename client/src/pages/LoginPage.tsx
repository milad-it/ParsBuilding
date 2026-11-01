import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Building3DHero } from '@/components/3d/login/Building3DComplex';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Building2, Phone, Lock, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC<{ onLoginSuccess?: () => void }> = ({ onLoginSuccess }) => {
  const { login, loginDemo, isLoading, error } = useAuthStore();
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
    <div dir="rtl" className="flex min-h-screen w-full bg-stone-100 text-stone-900 font-sans">
      {/* 3D Visual Hero Panel (Desktop) */}
      <div className="hidden lg:relative lg:flex lg:flex-1 lg:flex-col lg:justify-between bg-stone-900 border-e border-stone-800 p-8 overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">پارس بیلدینگ</h2>
            <p className="text-xs text-brand-300">سامانه جامع مدیریت هوشمند مجتمع‌های مسکونی</p>
          </div>
        </div>

        {/* 3D High-Rise Building Tower */}
        <div className="absolute inset-0 z-0">
          <Building3DHero />
        </div>

        <div className="relative z-10 rounded-2xl border border-stone-700/80 bg-stone-950/70 p-4 backdrop-blur-md max-w-sm">
          <p className="text-xs text-stone-300 leading-relaxed">
            محاسبه دقیق شارژ، تطبیق قانون تملک آپارتمان‌ها، تراز معین مالی و ارتباط زنده با ساکنین.
          </p>
        </div>
      </div>

      {/* Login Form Panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:flex-none lg:w-[480px] bg-white border-s border-stone-200 shadow-xl">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="text-right space-y-2">
            <div className="flex lg:hidden items-center gap-2 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-stone-900">پارس بیلدینگ</span>
            </div>
            <h1 className="text-2xl font-black text-stone-900">ورود به سامانه</h1>
            <p className="text-xs text-stone-500">
              جهت دسترسی به داشبورد مدیریت یا پرتال ساکنین وارد حساب خود شوید
            </p>
          </div>

          {(error || validationError) && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
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

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-stone-200"></div>
            <span className="flex-shrink mx-3 text-xs text-stone-400">یا ورود سریع پیش‌نمایش</span>
            <div className="flex-grow border-t border-stone-200"></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                loginDemo('COMPLEX_MANAGER');
                if (onLoginSuccess) onLoginSuccess();
              }}
              className="w-full text-xs hover:border-brand-600 hover:text-brand-700"
            >
              🏢 ورود مدیر ساختمان
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                loginDemo('RESIDENT');
                if (onLoginSuccess) onLoginSuccess();
              }}
              className="w-full text-xs hover:border-brand-600 hover:text-brand-700"
            >
              🔑 ورود ساکن (واحد ۵)
            </Button>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center text-xs text-stone-600">
            حساب پیش‌فرض مدیر: <span className="font-mono font-bold text-stone-800">09123456789</span> / <span className="font-mono font-bold text-stone-800">password123</span>
          </div>
        </div>
      </div>
    </div>
  );
};
