import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { AuthProvider, useAuth } from "./auth.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Tracking from "./pages/Tracking.jsx";
import Insurance from "./pages/Insurance.jsx";
import LiveTrack from "./pages/LiveTrack.jsx";
import Login from "./pages/Login.jsx";
import Payments from "./pages/Payments.jsx";
import Slip from "./pages/Slip.jsx";
import VerifySlip from "./pages/VerifySlip.jsx";

function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">🚚</span>
        <span>MandiTruck</span>
      </div>
      <nav className="nav">
        {user ? (
          <>
            <NavLink to="/tracking" className={({ isActive }) => (isActive ? "active" : "")}>Tracking</NavLink>
            <NavLink to="/insurance" className={({ isActive }) => (isActive ? "active" : "")}>Insurance</NavLink>
            <NavLink to="/payments" className={({ isActive }) => (isActive ? "active" : "")}>Payments</NavLink>
            <span className="nav-user">{user.name || user.email}</span>
            <button className="btn-ghost" onClick={() => { logout(); navigate("/login"); }}>Logout</button>
          </>
        ) : (
          <NavLink to="/login" className={({ isActive }) => (isActive ? "active" : "")}>Login</NavLink>
        )}
      </nav>
    </header>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Topbar />
        <main className="page">
          <Routes>
            <Route path="/" element={<Navigate to="/tracking" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/tracking" element={<ProtectedRoute><Tracking /></ProtectedRoute>} />
            <Route path="/insurance" element={<ProtectedRoute><Insurance /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
            <Route path="/slip/:paymentId" element={<ProtectedRoute><Slip /></ProtectedRoute>} />
            {/* Public: the link sent over SMS/WhatsApp (OTP protected) */}
            <Route path="/track/:tripId" element={<LiveTrack />} />
            {/* Public: driver scans the slip QR */}
            <Route path="/verify/:slipNo" element={<VerifySlip />} />
            <Route path="*" element={<Navigate to="/tracking" replace />} />
          </Routes>
        </main>
        <footer className="foot">MandiTruck · sample data · demo build</footer>
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
