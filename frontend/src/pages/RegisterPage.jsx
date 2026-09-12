import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PlaneCursor from '../components/PlaneCursor';
import Earth3D from '../components/Earth3D';

function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('http://localhost:5276/api/Auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirmPassword }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // Backend 409'da "Bu kullanıcı adı zaten kullanılıyor." gibi net bir mesaj döndürüyor
        setError(data?.message || 'Kayıt başarısız oldu.');
        setLoading(false);
        return;
      }

      navigate('/login', { state: { registered: true } });
    } catch {
      setError('Sunucuya bağlanılamadı. API çalışıyor mu kontrol et.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <PlaneCursor />

      <div className="auth-visual">
        <div className="auth-stars" />
        <div className="auth-earth-wrap">
          <Earth3D size={820} />
        </div>
        <div className="auth-visual-content">
          <div className="auth-visual-text">
            <h2>Başarsoft</h2>
            <p>Haritalama ve coğrafi bilgi sistemleri</p>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>Hesap oluştur</h1>
          <p className="login-subtitle">Başlamak için birkaç bilgi</p>

          <div className="login-field">
            <label htmlFor="username">Kullanıcı adı</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Şifre</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="login-field">
            <label htmlFor="confirmPassword">Şifre (tekrar)</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Kayıt olunuyor...' : 'Kayıt Ol'}
          </button>

          <p className="auth-switch">
            Zaten hesabın var mı? <Link to="/login">Giriş yap</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default RegisterPage;
