import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { saveAuth } from '../auth';
import PlaneCursor from '../components/PlaneCursor';
import Earth3D from '../components/Earth3D';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = Boolean(location.state?.registered);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:5276/api/Auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError('Kullanıcı adı veya şifre hatalı.');
        setLoading(false);
        return;
      }

      const data = await response.json();
      saveAuth(data.token, data.expiresAt);

      // Admin paneli linkini ve rol bazlı izinleri gösterebilmek için /me'yi de çekiyoruz —
      // bu isteğin başarısız olması giriş akışını engellemesin diye sessizce yutuyoruz,
      // en kötü ihtimalle admin linki görünmez ve izinler varsayılan (açık) kalır.
      try {
        const meResponse = await fetch('http://localhost:5276/api/Auth/me', {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        if (meResponse.ok) {
          const me = await meResponse.json();
          saveAuth(data.token, data.expiresAt, me);
        }
      } catch {
        // yoksayıldı — rol bilgisi olmadan da giriş yapılabilir
      }

      navigate('/');
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
            {/* Kullanıcının kendi isteği (3 Eylül): "yaratıcı bi şeyler olsun havalı olsun
                istiyorum." — marka bloğu artık canlı: koordinat rozetleri, ürünün gerçek
                rakamlarını gösteren istatistik şeridi ve nabız gibi atan bir "canlı" göstergesi. */}
            <span className="auth-badge">
              <span className="auth-badge-dot" />
              Coğrafi Bilgi Sistemi · Canlı
            </span>
            <h2>Başarsoft</h2>
            <p>Haritalama ve coğrafi bilgi sistemleri</p>
            {/* Kullanıcının kendi isteği (3 Eylül): "ikinci ssdeki şeyleri kaldır" —
                istatistik çipleri (8.7K POI / 6 hat / Canlı) kaldırıldı, sade marka bloğu
                ve altındaki koordinat şeridi kaldı. */}
            <div className="auth-coords">
              <span>39.9334° N</span>
              <span>32.8597° E</span>
              <span>EPSG:3857</span>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>Tekrar hoş geldin</h1>
          <p className="login-subtitle">Devam etmek için giriş yapın</p>

          {justRegistered && (
            <p className="success">Kayıt başarılı, şimdi giriş yapabilirsin.</p>
          )}

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
              autoComplete="current-password"
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>

          <p className="auth-switch">
            Hesabın yok mu? <Link to="/register">Kayıt ol</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
