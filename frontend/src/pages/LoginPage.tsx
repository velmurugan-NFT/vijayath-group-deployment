import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { BrandMark } from '@/components/design/BrandMark';
import { toast } from 'sonner';

const DEMO_USERS = [
  { email: 'admin@vijayanth.in', role: 'Super Admin' },
  { email: 'corporate@vijayanth.in', role: 'Corporate Office' },
  { email: 'solar.head@vijayanth.in', role: 'Sector Head' },
  { email: 'suresh@vijayanth.in', role: 'Project Head (1 MW)' },
  { email: 'kavi@vijayanth.in', role: 'Project Head (4 MW)' },
];

export function LoginPage() {
  const [email, setEmail] = useState('suresh@vijayanth.in');
  const [password, setPassword] = useState('demo123');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success('Welcome back');
      navigate('/');
    } catch {
      toast.error('Invalid credentials');
    }
  };

  return (
    <div className="login-bg">
      <div className="login-shell">
        <div className="login-left">
          <div className="flex items-center gap-3.5 mb-9">
            <BrandMark size={42} />
            <div>
              <div className="brand-text"><span className="name">VIJAYANTH</span></div>
              <div className="sub text-white/50 text-[11.5px] tracking-wide mt-0.5">RENEWABLE ENERGY PROJECTS</div>
            </div>
          </div>
          <h1 className="login-tagline">
            Every <em>watt</em>, every <em>rupee</em>,<br />
            every site decision —<br />
            traced.
          </h1>
          <p className="login-blurb">
            Project Management &amp; Finance Tracking Platform for the Solar sector. From WBS sign-off through commissioning — one source of truth, four roles, complete audit trail.
          </p>
          <div className="login-metrics">
            <div><div className="m-val">7 MW</div><div className="m-lbl">Live capacity</div></div>
            <div><div className="m-val">₹27 Cr</div><div className="m-lbl">Tracked billables</div></div>
            <div><div className="m-val">100%</div><div className="m-lbl">Approval coverage</div></div>
          </div>
        </div>
        <div className="login-right">
          <h2>Sign in</h2>
          <div className="h-sub">Use your Vijayanth account to continue.</div>
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-1.5 text-vijayanth-muted">
                <input type="checkbox" defaultChecked /> Keep me signed in
              </label>
              <a href="#" className="text-vijayanth-green font-medium" onClick={(e) => e.preventDefault()}>Forgot password?</a>
            </div>
            <button type="submit" className="btn btn-primary h-10 justify-center mt-1">
              <Lock className="w-3.5 h-3.5" /> Sign in
            </button>
          </form>
          <div className="demo-creds">
            <div className="h">Demo accounts · password <code>demo123</code></div>
            {DEMO_USERS.map((u) => (
              <div key={u.email} className="row" onClick={() => setEmail(u.email)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEmail(u.email)}>
                <code>{u.email}</code>
                <span className="text-vijayanth-muted">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
