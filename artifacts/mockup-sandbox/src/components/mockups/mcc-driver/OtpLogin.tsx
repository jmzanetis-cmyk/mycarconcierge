import './_group.css';
import { Phone, ShieldCheck, Sun } from 'lucide-react';

export function OtpLogin() {
  return (
    <div className="mcc-driver" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#c9a227,#b8942d)', display: 'grid', placeItems: 'center', color: '#12161c', fontWeight: 800, fontFamily: "'Playfair Display',serif" }}>M</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>MCC Driver</div>
        </div>
        <button className="ghost-btn" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sun size={14} /> Day
        </button>
      </header>

      <div style={{ marginTop: 20 }}>
        <div className="pill" style={{ background: 'rgba(0,184,169,0.12)', color: '#00b8a9', marginBottom: 14 }}>
          <ShieldCheck size={12} /> Step 2 of 2
        </div>
        <h1 className="display" style={{ fontSize: 30, lineHeight: 1.15, margin: 0, marginBottom: 8 }}>
          Enter the code we<br />texted you
        </h1>
        <p style={{ color: '#a8b0bd', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          We sent a 6-digit code to <span style={{ color: '#f4f1ea', fontWeight: 600 }}>(415) 555 ••12</span>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        {['4', '8', '2', '1', '', ''].map((v, i) => (
          <input key={i} className={`otp-cell ${v ? 'filled' : ''}`} defaultValue={v} maxLength={1} />
        ))}
      </div>

      <button className="gold-btn" style={{ padding: '16px', fontSize: 16, marginTop: 4 }}>
        Verify & continue
      </button>

      <button className="ghost-btn" style={{ padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Phone size={14} /> Resend code in 0:42
      </button>

      <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid #2d3540', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>
          Drivers must be 21+ with valid commercial insurance.
        </p>
      </div>
    </div>
  );
}
