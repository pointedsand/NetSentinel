import { useState, type FormEvent } from 'react';
import netSentinelMark from '../assets/netsentinel-mark.png';
import { NetworkAuthorizationPanel } from '../components/NetworkAuthorizationPanel';

interface AuthPageProps {
  onSimulation: () => void;
  onContinue: () => void;
}

export function AuthPage({ onContinue, onSimulation }: AuthPageProps) {
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [setupStep, setSetupStep] = useState<'credentials' | 'network' | 'complete'>('credentials');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (creatingAccount) {
      const formData = new FormData(event.currentTarget);
      if (formData.get('password') !== formData.get('confirmPassword')) {
        setMessage('Those passwords don’t match. Please try again.');
        setMessageIsError(true);
        return;
      }
      setMessage('');
      setSetupStep('network');
      return;
    }

    setMessage('Account services aren’t connected yet, so your details haven’t been saved.');
    setMessageIsError(false);
  };

  const changeMode = (create: boolean) => {
    setCreatingAccount(create);
    setSetupStep('credentials');
    setMessage('');
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <aside className="auth-intro">
          <a className="auth-brand" href="#" onClick={(event) => event.preventDefault()}>
            <span>NetSentinel</span>
          </a>
          <div className="auth-network-art" aria-hidden="true">
            <span className="auth-network-line auth-network-line-one" />
            <span className="auth-network-line auth-network-line-two" />
            <span className="auth-network-line auth-network-line-three" />
            <span className="auth-network-node auth-network-node-center">
              <img className="auth-network-logo" src={netSentinelMark} alt="" />
            </span>
            <span className="auth-network-node auth-network-node-one" />
            <span className="auth-network-node auth-network-node-two" />
            <span className="auth-network-node auth-network-node-three" />
          </div>
          <div className="auth-intro-copy">
            <span className="eyebrow">YOUR NETWORK, IN VIEW</span>
            <h1>See what’s happening on your network.</h1>
            <p>Keep an eye on traffic, connected devices, and security activity in one place.</p>
          </div>
        </aside>

        <div className="auth-form-panel">
          <div className="auth-mobile-brand">
            <span>NetSentinel</span>
          </div>
          {setupStep === 'credentials' && (
            <>
              <span className="auth-step-label">{creatingAccount ? 'GET STARTED' : 'WELCOME BACK'}</span>
              <h2 id="auth-title">{creatingAccount ? 'Create your account' : 'Sign in'}</h2>
              <p className="auth-subtitle">
                {creatingAccount
                  ? 'Set up an account to continue to NetSentinel.'
                  : 'Account preview. Open the local dashboard below to capture traffic without signing in.'}
              </p>

              <form className="auth-form" onSubmit={handleSubmit}>
                {creatingAccount && (
                  <div className="auth-field">
                    <label htmlFor="auth-name">Name</label>
                    <input id="auth-name" name="name" type="text" autoComplete="name" placeholder="Your name" required />
                  </div>
                )}
                <div className="auth-field">
                  <label htmlFor="auth-email">Email address</label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete={creatingAccount ? 'new-password' : 'current-password'}
                    placeholder={creatingAccount ? 'At least 8 characters' : 'Enter your password'}
                    minLength={creatingAccount ? 8 : undefined}
                    required
                  />
                </div>
                {creatingAccount && (
                  <div className="auth-field">
                    <label htmlFor="auth-confirm-password">Confirm password</label>
                    <input
                      id="auth-confirm-password"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Enter your password again"
                      minLength={8}
                      required
                    />
                  </div>
                )}

                {message && (
                  <p className={`auth-message${messageIsError ? ' is-error' : ''}`} role={messageIsError ? 'alert' : 'status'}>
                    {message}
                  </p>
                )}

                <button className="auth-submit" type="submit">
                  {creatingAccount ? 'Continue' : 'Sign in'}
                </button>
              </form>

              <p className="auth-switch">
                {creatingAccount ? 'Already have an account?' : 'New to NetSentinel?'}{' '}
                <button type="button" onClick={() => changeMode(!creatingAccount)}>
                  {creatingAccount ? 'Sign in' : 'Create an account'}
                </button>
              </p>

            </>
          )}

          {setupStep === 'network' && (
            <>
              <span className="auth-step-label">ACCOUNT SETUP · 2 OF 2</span>
              <h2 id="auth-title">Authorize a network</h2>
              <p className="auth-subtitle">
                Choose networks you’re connected to and have permission to monitor.
              </p>
              <NetworkAuthorizationPanel mode="setup" onComplete={() => setSetupStep('complete')} />
              <button className="auth-back-button" type="button" onClick={() => setSetupStep('credentials')}>
                Back to account details
              </button>
            </>
          )}

          {setupStep === 'complete' && (
            <div className="auth-setup-complete">
              <span className="auth-step-label">SETUP PREVIEW</span>
              <h2 id="auth-title">Network selected</h2>
              <p className="auth-subtitle">
                Account services aren’t connected, so your account and network selection haven’t been saved. This preview
                can’t verify the current Wi-Fi connection.
              </p>
              <button className="auth-submit auth-return-button" type="button" onClick={() => changeMode(false)}>
                Return to sign in
              </button>
            </div>
          )}

          <div className="auth-divider"><span>OR</span></div>
          <button className="auth-submit" type="button" onClick={onContinue}>
            Open local dashboard
          </button>
          <button className="auth-skip" type="button" onClick={onSimulation}>
            Explore offline simulation
          </button>
        </div>
      </section>
    </main>
  );
}
