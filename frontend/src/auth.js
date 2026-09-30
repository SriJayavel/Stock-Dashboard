import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
const SUPABASE_URL = rawUrl && !rawUrl.startsWith('http') ? `https://${rawUrl}` : rawUrl;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim().replace(/^['"]|['"]$/g, '');

export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;

class MaraAccount {
  constructor() {
    this.session = null;
    this.user = null;
    this.token = '';
    this.onAuthenticated = null;
    this.started = false;
    this.mode = 'signin';
    this.recoveryPath = window.location.pathname === '/reset-password';
  }

  async initialize() {
    document.body.classList.add('auth-required');
    document.getElementById('auth-gate')?.classList.remove('auth-gate-hidden');
    document.getElementById('auth-signout')?.addEventListener('click', () => this.signOut());
    this.bindForm();

    if (!supabase) {
      this.setMessage('Mara account access is not configured yet. Please contact the site administrator.');
      return false;
    }

    supabase.auth.onAuthStateChange((event, session) => {
      this.setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        this.recoveryPath = true;
        this.setMode('recovery');
      } else if (session && !this.recoveryPath) {
        this.enterApp();
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') this.onAuthenticated?.();
      } else if (event === 'SIGNED_OUT' && this.started) {
        window.location.assign('/');
      }
    });

    const { data, error } = await supabase.auth.getSession();
    if (error) this.setMessage('Unable to restore your session. Sign in to continue.');
    this.setSession(data?.session || null);
    if (this.recoveryPath) {
      this.setMode('recovery');
      return false;
    }
    if (this.session) {
      this.enterApp();
      return true;
    }
    this.setMode('signin');
    return false;
  }

  bindForm() {
    document.getElementById('auth-form')?.addEventListener('submit', (event) => this.submit(event));
    document.getElementById('auth-mode-signin')?.addEventListener('click', () => this.setMode('signin'));
    document.getElementById('auth-mode-signup')?.addEventListener('click', () => this.setMode('signup'));
    document.getElementById('auth-forgot-button')?.addEventListener('click', () => this.setMode('reset'));
    document.getElementById('auth-back-button')?.addEventListener('click', () => this.setMode('signin'));
    document.getElementById('auth-password-toggle')?.addEventListener('click', () => {
      const input = document.getElementById('auth-password');
      const button = document.getElementById('auth-password-toggle');
      if (!input || !button) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? 'Show' : 'Hide';
      button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
      button.setAttribute('aria-pressed', String(input.type === 'text'));
    });
  }

  async submit(event) {
    event.preventDefault();
    if (!supabase) {
      this.setMessage('Authentication service is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment environment variables and redeploy.');
      return;
    }
    const email = document.getElementById('auth-email')?.value.trim();
    const password = document.getElementById('auth-password')?.value || '';
    const confirmPassword = document.getElementById('auth-confirm-password')?.value || '';
    const button = document.getElementById('auth-submit');
    if (!email) return this.setMessage('Enter your email address.');
    if (this.mode !== 'reset' && !password) return this.setMessage('Enter your password.');
    if (button) { button.disabled = true; button.textContent = 'Please wait…'; }
    this.setMessage('');
    try {
      if (this.mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        this.setMessage('If an account exists for this email, a password reset link is on its way.', 'success');
      } else if (this.mode === 'recovery') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (password !== confirmPassword) throw new Error('Those passwords do not match.');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        this.recoveryPath = false;
        window.history.replaceState({}, '', '/');
        this.enterApp();
        this.onAuthenticated?.();
        this.setMessage('Password updated. Your Mara workspace is ready.', 'success');
      } else if (this.mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (password !== confirmPassword) throw new Error('Those passwords do not match.');
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) {
          this.setSession(data.session);
          this.enterApp();
          this.onAuthenticated?.();
        } else {
          this.setMessage('Check your inbox for a confirmation link to finish creating your account.', 'success');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        this.setSession(data.session);
        this.enterApp();
        this.onAuthenticated?.();
      }
    } catch (error) {
      this.setMessage(this.friendlyError(error));
    } finally {
      if (button) { button.disabled = false; button.textContent = this.submitLabel(); }
    }
  }

  friendlyError(error) {
    const message = error?.message || 'Something went wrong. Please try again.';
    if (/failed to fetch/i.test(message)) return 'Connection error: Unable to reach Supabase. Check your Supabase URL in Vercel or pause ad-blockers (ABP) for this page.';
    if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
    if (/already registered|already been registered/i.test(message)) return 'An account already exists for this email. Sign in instead.';
    if (/email not confirmed/i.test(message)) return 'Confirm your email from the link we sent before signing in.';
    if (/rate limit|too many requests/i.test(message)) return 'Too many attempts. Wait a little and try again.';
    return message;
  }

  setMode(mode) {
    this.mode = mode;
    const signup = mode === 'signup';
    const recovery = mode === 'recovery';
    const reset = mode === 'reset';
    const title = document.getElementById('auth-form-title');
    const description = document.getElementById('auth-form-description');
    const confirm = document.getElementById('auth-confirm-field');
    const password = document.getElementById('auth-password-field');
    const passwordInput = document.getElementById('auth-password');
    const tabs = document.getElementById('auth-mode-tabs');
    const forgot = document.getElementById('auth-forgot-button');
    const back = document.getElementById('auth-back-button');
    if (title) title.textContent = recovery ? 'Choose a new password' : reset ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back';
    if (description) description.textContent = recovery ? 'Set a new password to secure your Mara account.' : reset ? 'Enter your account email and we’ll send a reset link.' : signup ? 'A private market workspace, ready when you are.' : 'Sign in to continue to your market workspace.';
    if (confirm) confirm.hidden = !(signup || recovery);
    if (password) password.hidden = reset;
    if (passwordInput) passwordInput.autocomplete = signup || recovery ? 'new-password' : 'current-password';
    if (tabs) tabs.hidden = reset || recovery;
    if (forgot) forgot.hidden = signup || reset || recovery;
    if (back) back.hidden = !(reset || recovery);
    const submit = document.getElementById('auth-submit');
    if (submit) submit.textContent = this.submitLabel();
    document.getElementById('auth-mode-signin')?.classList.toggle('active', mode === 'signin');
    document.getElementById('auth-mode-signup')?.classList.toggle('active', signup);
    document.getElementById('auth-mode-signin')?.setAttribute('aria-selected', String(mode === 'signin'));
    document.getElementById('auth-mode-signup')?.setAttribute('aria-selected', String(signup));
    this.setMessage('');
  }

  submitLabel() {
    return this.mode === 'signup' ? 'Create account' : this.mode === 'reset' ? 'Send reset link' : this.mode === 'recovery' ? 'Update password' : 'Sign in';
  }

  setMessage(message, state = 'error') {
    const el = document.getElementById('auth-message');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('success', state === 'success');
  }

  setSession(session) {
    this.session = session;
    this.user = session?.user || null;
    this.token = session?.access_token || '';
  }

  enterApp() {
    if (!this.session || this.recoveryPath) return;
    this.started = true;
    document.body.classList.remove('auth-required');
    document.getElementById('auth-gate')?.classList.add('auth-gate-hidden');
    const account = document.getElementById('auth-account');
    const name = document.getElementById('auth-account-name');
    if (account) account.hidden = false;
    if (name) name.textContent = this.user?.email || 'Mara account';
  }

  async signOut() {
    if (supabase) await supabase.auth.signOut();
    window.location.assign('/');
  }

  async expireToken() {
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    else window.location.reload();
  }

  storageKey(key) {
    return this.user?.id ? `mara_account_${this.user.id}_${key}` : key;
  }
}

export const auth = new MaraAccount();
export const getAuthToken = () => auth.token;
export const getAccountStorageKey = (key) => auth.storageKey(key);
