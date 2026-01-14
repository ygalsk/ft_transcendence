import { useNavigate } from 'react-router-dom';

function NotFound() {
  const navigate = useNavigate();

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
      color: '#e2e8f0',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '6rem', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>Page not found</p>
      <button 
        onClick={() => navigate('/')}
        style={{
          padding: '0.75rem 2rem',
          fontSize: '1rem',
          background: '#06b6d4',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          transition: 'background 0.2s'
        }}
      >
        Go Home
      </button>
    </div>
  );
}

export default NotFound;