import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Fish, User, MapPin, Calendar, ChevronRight, Plus } from 'lucide-react';
import './index.css';

const Home = () => {
  return (
    <div className="content">
      <h1 className="hero-title">Time by the water.</h1>
      <p className="hero-subtitle">Your private fishing journal</p>

      <div className="hero-image-container">
        <img src="https://images.unsplash.com/photo-1518110927702-8a9d18e5b61e?q=80&w=600&auto=format&fit=crop" alt="River" className="hero-image" />
      </div>

      <div className="card">
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>Next Session</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 className="serif" style={{ fontSize: '24px' }}>Dolphinholme</h2>
          <ChevronRight size={20} color="var(--text-secondary)" />
        </div>
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <div className="tag">
            <MapPin size={14} /> Coarse fishing
          </div>
          <div className="tag">
            <span style={{color: '#D9534F'}}>◎</span> Target: Perch, Chub
          </div>
        </div>
        <button className="btn-primary">
          <Plus size={20} /> Start session
        </button>
      </div>

      <div className="section-header">
        <h2 className="serif section-title">Recent catches</h2>
        <a href="#" className="view-all">View all <ChevronRight size={16} /></a>
      </div>

      <div className="card">
        <div className="catch-item">
          <img src="https://images.unsplash.com/photo-1544716447-0d32b5042456?q=80&w=150&auto=format&fit=crop" alt="Perch" className="catch-img" />
          <div className="catch-info">
            <div className="catch-species">Perch</div>
            <div className="catch-weight">1 lb 8 oz</div>
            <div className="catch-meta">Worm · Yesterday</div>
          </div>
          <ChevronRight size={20} color="var(--text-secondary)" />
        </div>
        <div className="catch-item">
          <img src="https://images.unsplash.com/photo-1598463870233-a36c478a876a?q=80&w=150&auto=format&fit=crop" alt="Chub" className="catch-img" />
          <div className="catch-info">
            <div className="catch-species">Chub</div>
            <div className="catch-weight">3 lb 2 oz</div>
            <div className="catch-meta">Bread · 28 Sep</div>
          </div>
          <ChevronRight size={20} color="var(--text-secondary)" />
        </div>
      </div>
    </div>
  );
};

const Navigation = () => {
  const location = useLocation();
  return (
    <div className="bottom-nav">
      <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
        <Fish className="nav-icon" />
        Home
      </Link>
      <Link to="/sessions" className={`nav-item ${location.pathname === '/sessions' ? 'active' : ''}`}>
        <Calendar className="nav-icon" />
        Sessions
      </Link>
      <Link to="/discover" className={`nav-item ${location.pathname === '/discover' ? 'active' : ''}`}>
        <MapPin className="nav-icon" />
        Discover
      </Link>
      <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`}>
        <User className="nav-icon" />
        Profile
      </Link>
    </div>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="top-bar">
          <div className="logo-header">
            <Fish size={28} />
            Keepnet
          </div>
          <div className="profile-btn">
            <User size={20} />
          </div>
        </header>
        
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sessions" element={<div className="content"><h2>Sessions</h2></div>} />
          <Route path="/discover" element={<div className="content"><h2>Discover</h2></div>} />
          <Route path="/profile" element={<div className="content"><h2>Profile</h2></div>} />
        </Routes>
        
        <Navigation />
      </div>
    </BrowserRouter>
  );
};

export default App;
