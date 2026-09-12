import { Navigate } from 'react-router-dom';
import { isAuthValid, isAdmin } from '../auth';

// Admin paneline sadece rolü "Admin" olan kullanıcılar girebilir. Giriş yapmamışsa
// login'e, giriş yapmış ama admin değilse haritaya (sessizce) geri gönderiyoruz —
// admin olmayan birine "yetkiniz yok" ekranı göstermek yerine normal akışına devam ettiriyoruz.
function AdminRoute({ children }) {
  if (!isAuthValid()) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin()) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default AdminRoute;
