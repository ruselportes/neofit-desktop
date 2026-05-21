import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { CheckIn } from '../types';

export default function AttendanceView({ showNotification }: { showNotification: (message: string, type?: 'success' | 'error') => void }) {
  const today = new Date().toLocaleDateString('sv');
  const [selectedDate, setSelectedDate] = useState(today);
  const [memberId, setMemberId] = useState('M-');
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);

  const handleMemberIdChange = (value: string) => {
    // Always keep the M- prefix
    if (!value.startsWith('M-')) {
      setMemberId('M-');
      return;
    }
    const afterPrefix = value.slice(2).replace(/\D/g, ''); // digits only after M-
    setMemberId('M-' + afterPrefix.slice(0, 3)); // max 3 digits (M-001 to M-999)
  };

  const loadCheckIns = useCallback(() => {
    api.fetchCheckIns(selectedDate)
      .then(setCheckIns)
      .catch(err => {
        console.error(err);
      });
  }, [selectedDate]);

  useEffect(() => { loadCheckIns(); }, [loadCheckIns]);

  const handleCheckIn = async () => {
    if (selectedDate !== today) return;
    if (!memberId.trim()) return;
    try {
      const result = await api.createCheckIn(memberId.trim());
      showNotification(`${result.memberName} checked in successfully!`);
      setMemberId('M-');
      loadCheckIns();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to check in.';
      showNotification(errMsg, 'error');
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="header-title">
          <h2>Attendance Tracker</h2>
          <p>Monitor live gym check-ins.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--glass-bg)', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date:</label>
          <input
            type="date"
            className="input-field"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ width: '150px', padding: '4px 8px', fontSize: '0.85rem', margin: 0, height: 'auto', background: 'transparent', border: 'none', color: 'var(--text-main)' }}
          />
        </div>
      </header>


      {selectedDate !== today && (
        <div style={{ 
          textAlign: 'center', 
          color: '#ff9800', 
          background: 'rgba(255, 152, 0, 0.1)', 
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '1.5rem',
          fontSize: '0.9rem',
          fontWeight: 500
        }}>
          ⚠️ Viewing past logs. Manual check-in is disabled.
        </div>
      )}

      <div className="search-bar" style={{ justifyContent: 'center', opacity: selectedDate !== today ? 0.6 : 1 }}>
        <input
          type="text" className="input-field" placeholder="M-001"
          value={memberId} onChange={e => handleMemberIdChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCheckIn()}
          style={{ maxWidth: '300px' }}
          maxLength={5}
          disabled={selectedDate !== today}
        />
        <button className="btn-primary" onClick={handleCheckIn} disabled={selectedDate !== today}>Check In</button>
      </div>

      <div style={{ marginTop: '2.5rem' }}>
        <h3 className="section-title">{selectedDate === today ? "Today's Log" : `Logs for ${selectedDate}`}</h3>
        {checkIns.length > 0 ? (
          <div className="table-container">
            <table className="table-dashboard">
              <thead><tr><th>Member</th><th>ID</th><th>Time-In</th><th>Status</th></tr></thead>
              <tbody>
                {checkIns.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.memberName}</strong></td>
                    <td>{c.memberId}</td>
                    <td>{c.time}</td>
                    <td><span className={`badge ${c.status.replace(' ','-').toLowerCase()}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--text-muted)', 
            padding: '3rem 1rem', 
            border: '1px dashed var(--glass-border)', 
            borderRadius: '8px',
            background: 'var(--glass-bg)',
            fontSize: '0.95rem'
          }}>
            No check-in logs found for this date.
          </div>
        )}
      </div>
    </div>
  );
}
