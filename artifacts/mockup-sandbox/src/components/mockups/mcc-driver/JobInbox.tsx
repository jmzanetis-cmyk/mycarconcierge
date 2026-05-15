import './_group.css';
import { MapPin, Clock, ArrowRight, Sun, DollarSign, Car } from 'lucide-react';

export function JobInbox() {
  const jobs = [
    { id: 'C-4839', tier: 'Tier 2 · Round trip', vehicle: 'Audi Q5 (2022)', from: 'Pacific Heights', to: 'Stellar Auto', miles: '4.2 mi', when: 'Now', pay: '$42.00', urgent: true },
    { id: 'C-4837', tier: 'Tier 1 · One-way', vehicle: 'Ford F-150', from: 'Mission District', to: 'Bay Auto Glass', miles: '2.8 mi', when: 'In 35 min', pay: '$24.50', urgent: false },
    { id: 'C-4835', tier: 'Tier 3 · Multi-leg', vehicle: 'BMW 3 Series', from: 'SOMA', to: '+ 2 stops', miles: '11.6 mi', when: 'Today 3:00 PM', pay: '$78.00', urgent: false },
  ];

  return (
    <div className="mcc-driver" style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: '#a8b0bd', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Good morning, Marcus</div>
          <h1 className="display" style={{ fontSize: 24, margin: 0, marginTop: 2 }}>Available jobs</h1>
        </div>
        <button className="ghost-btn" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sun size={14} /> Day
        </button>
      </header>

      <div style={{ display: 'flex', gap: 8 }}>
        <div className="card" style={{ padding: '10px 12px', flex: 1 }}>
          <div style={{ fontSize: 10, color: '#a8b0bd', textTransform: 'uppercase', fontWeight: 600 }}>Today</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: '#c9a227' }}>$184.20</div>
        </div>
        <div className="card" style={{ padding: '10px 12px', flex: 1 }}>
          <div style={{ fontSize: 10, color: '#a8b0bd', textTransform: 'uppercase', fontWeight: 600 }}>Jobs</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700 }}>5 done</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {['All', 'Nearby', 'Scheduled'].map((t, i) => (
          <button key={t} className={i === 0 ? 'gold-btn' : 'ghost-btn'} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 999 }}>{t}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {jobs.map((j) => (
          <div key={j.id} className="card" style={{ padding: 14, position: 'relative' }}>
            {j.urgent && (
              <div className="pill" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', position: 'absolute', top: 10, right: 10 }}>
                <Clock size={10} /> Urgent
              </div>
            )}
            <div style={{ fontSize: 11, color: '#a8b0bd', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              {j.tier}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontWeight: 600, fontSize: 15 }}>
              <Car size={14} style={{ color: '#c9a227' }} /> {j.vehicle}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#a8b0bd' }}>
              <MapPin size={12} style={{ color: '#00b8a9' }} />
              <span style={{ color: '#f4f1ea' }}>{j.from}</span>
              <ArrowRight size={11} />
              <span style={{ color: '#f4f1ea' }}>{j.to}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #2d3540' }}>
              <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#a8b0bd' }}>
                <span>{j.miles}</span>
                <span>·</span>
                <span>{j.when}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 18, color: '#c9a227' }}>
                <DollarSign size={14} />{j.pay.replace('$', '')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
