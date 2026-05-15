import './_group.css';
import { MapPin, Navigation, Car, CheckCircle2, AlertTriangle, Clock, Phone, Moon } from 'lucide-react';

export function ActiveJob() {
  const legs = [
    { label: 'Pickup at member', addr: '124 Hayes St, SF', status: 'done' },
    { label: 'Drop at provider', addr: 'Stellar Auto, 88 Bryant St', status: 'active' },
    { label: 'Return to member', addr: '124 Hayes St, SF', status: 'pending' },
  ];

  return (
    <div className="mcc-driver" style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#a8b0bd', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Job #C-4821</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 20, marginTop: 2 }}>2021 Tesla Model Y</div>
        </div>
        <button className="ghost-btn" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Moon size={14} /> Night
        </button>
      </header>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span className="pill" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>
            <Car size={11} /> Vehicle Received
          </span>
          <span style={{ fontSize: 12, color: '#a8b0bd', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> 11:42 AM
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {legs.map((leg, i) => {
            const dotColor = leg.status === 'done' ? '#4ade80' : leg.status === 'active' ? '#c9a227' : '#2d3540';
            const txtColor = leg.status === 'pending' ? '#6b7280' : '#f4f1ea';
            return (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 12, height: 12, borderRadius: 999, background: dotColor, marginTop: 4, boxShadow: leg.status === 'active' ? '0 0 0 4px rgba(201,162,39,0.18)' : 'none' }} />
                  {i < legs.length - 1 && <div style={{ flex: 1, width: 2, background: '#2d3540', minHeight: 28 }} />}
                </div>
                <div style={{ paddingBottom: 14, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txtColor }}>{leg.label}</div>
                  <div style={{ fontSize: 12, color: '#a8b0bd', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <MapPin size={11} /> {leg.addr}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button className="gold-btn" style={{ padding: '14px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Navigation size={16} /> Navigate to drop-off
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button className="ghost-btn" style={{ padding: '12px 8px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <CheckCircle2 size={14} /> Mark Released
        </button>
        <button className="ghost-btn" style={{ padding: '12px 8px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Phone size={14} /> Call provider
        </button>
      </div>

      <button style={{ padding: '12px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
        <AlertTriangle size={14} /> Flag a problem
      </button>

      <div className="card" style={{ padding: 12, marginTop: 4, background: 'linear-gradient(180deg, rgba(0,184,169,0.06), rgba(0,184,169,0.02))', borderColor: 'rgba(0,184,169,0.3)' }}>
        <div style={{ fontSize: 11, color: '#00b8a9', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Earnings (this leg)</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginTop: 2 }}>$28.40</div>
      </div>
    </div>
  );
}
