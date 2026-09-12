import { Navigate } from 'react-router-dom';
import { isAuthValid } from '../auth';

function ProtectedRoute({ children }) {
  if (!isAuthValid()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default ProtectedRoute;