import { useState } from 'react';
import { Lock, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react';
import type { Language } from '../types/tracker';
import { DICTIONARY } from '../lib/i18n';
import { loginLocalAccount, registerLocalAccount } from '../lib/storage';

interface AuthScreenProps {
  lang: Language;
  onAuthenticated: (username: string) => void;
  onViewIntro?: () => void;
  onGoogleLogin?: () => Promise<void> | void;
}

export function AuthScreen({
  lang,
  onAuthenticated,
  onViewIntro,
  onGoogleLogin,
}: AuthScreenProps) {
  const t = DICTIONARY[lang];
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      const res = await registerLocalAccount(username, password, lang);
      if (!res.ok) {
        setError(res.error === 'exists' ? t.authUserExistsError : res.error === 'unavailable' ? (lang === 'ar' ? 'المتصفح ده مش بيدعم تأمين كلمة المرور. جرّب متصفح أحدث.' : 'This browser cannot secure the password. Try a newer browser.') : t.authEmptyError);
        return;
      }
      onAuthenticated(res.username);
    } else {
      const res = await loginLocalAccount(username, password);
      if (!res.ok) {
        setError(res.error === 'invalid' ? t.authInvalidCredsError : res.error === 'unavailable' ? (lang === 'ar' ? 'المتصفح ده مش بيدعم تأمين كلمة المرور. جرّب متصفح أحدث.' : 'This browser cannot verify passwords. Try a newer browser.') : t.authEmptyError);
        return;
      }
      onAuthenticated(res.username);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-6">
      <div className="w-full max-w-[440px] bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-6 md:p-8 space-y-6">
        <div className="text-center space-y-2.5">
          <div className="mx-auto w-14 h-14 rounded-full bg-[#00B8A9]/15 border border-[#00B8A9]/40 flex items-center justify-center">
            <ShieldCheck size={26} className="text-[#00B8A9]" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">
            {mode === 'login' ? t.authTitleLogin : t.authTitleRegister}
          </h1>
          <p className="text-xs text-[#A1A1AA] leading-relaxed">{t.authSubtitle}</p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] text-[11px] font-bold text-[#00B8A9]">
            <Lock size={12} className="shrink-0" />
            <span>{t.authPrivacyBadge}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-[#0F0F0F] border border-[#2A2A2A]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className="py-2.5 rounded-full text-xs font-extrabold transition flex items-center justify-center gap-1.5 min-h-[40px]"
            style={{
              backgroundColor: mode === 'login' ? '#00B8A9' : 'transparent',
              color: mode === 'login' ? '#0F0F0F' : '#A1A1AA',
            }}
          >
            <LogIn size={14} />
            <span>{t.authLoginTab}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className="py-2.5 rounded-full text-xs font-extrabold transition flex items-center justify-center gap-1.5 min-h-[40px]"
            style={{
              backgroundColor: mode === 'register' ? '#00B8A9' : 'transparent',
              color: mode === 'register' ? '#0F0F0F' : '#A1A1AA',
            }}
          >
            <UserPlus size={14} />
            <span>{t.authRegisterTab}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="auth-username"
              className="block text-xs font-bold text-[#A1A1AA]"
            >
              {t.usernameLabel}
            </label>
            <div className="relative">
              <User
                size={16}
                className="text-[#71717A] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none"
              />
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder={t.usernamePlaceholder}
                className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] ps-10 pe-4 py-3 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="auth-password"
              className="block text-xs font-bold text-[#A1A1AA]"
            >
              {t.passwordLabel}
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="text-[#71717A] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none"
              />
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder={t.passwordPlaceholder}
                className="w-full rounded-2xl bg-[#0F0F0F] border border-[#2A2A2A] ps-10 pe-4 py-3 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9]"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-[#FF6B35]/10 border border-[#FF6B35] text-xs font-bold text-[#FF6B35]"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 rounded-full bg-[#00B8A9] text-[#0F0F0F] font-extrabold text-sm md:text-base flex items-center justify-center gap-2 active:scale-[0.99] transition min-h-[48px]"
          >
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            <span>{mode === 'login' ? t.loginBtn : t.createAccountBtn}</span>
          </button>
        </form>

        {onGoogleLogin && (
          <div className="pt-2 border-t border-[#2A2A2A] space-y-2">
            <button
              type="button"
              data-testid="auth-google-signin-btn"
              onClick={() => onGoogleLogin()}
              className="w-full py-3 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-extrabold text-white flex items-center justify-center gap-2 min-h-[44px] transition"
            >
              <span>{t.cloudSignInGoogle}</span>
            </button>
          </div>
        )}

        {onViewIntro && (
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={onViewIntro}
              className="text-xs font-bold text-[#A1A1AA] hover:text-[#00B8A9] underline underline-offset-4 min-h-[36px]"
            >
              {t.introReplayFromAuth}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
