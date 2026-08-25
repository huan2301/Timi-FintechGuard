import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Layout/Navbar';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transfer from './pages/Transfer';
import Intervention from './pages/Intervention';
import History from './pages/History';

// Admin
import AdminLayout from './pages/Admin/AdminLayout';
import ExcelImport from './pages/Admin/ExcelImport';
import BlacklistManager from './pages/Admin/BlacklistManager';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-20 text-center">Loading...</div>;
  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="p-20 text-center">Loading...</div>;
  return isAdmin ? children : <Navigate to="/" />;
}

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<PrivateRoute><AppLayout><Dashboard /></AppLayout></PrivateRoute>} />
          <Route path="/transfer" element={<PrivateRoute><AppLayout><Transfer /></AppLayout></PrivateRoute>} />
          <Route path="/intervention/:txId" element={<PrivateRoute><AppLayout><Intervention /></AppLayout></PrivateRoute>} />
          <Route path="/history" element={<PrivateRoute><AppLayout><History /></AppLayout></PrivateRoute>} />
          
          {/* Admin routes */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route path="import" element={<ExcelImport />} />
            <Route path="blacklist" element={<BlacklistManager />} />
            <Route index element={<Navigate to="blacklist" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}