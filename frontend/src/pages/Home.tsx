import { useNavigate } from 'react-router-dom';
import '../styles/Home.css';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <div className="home-content">
        <h1 className="home-title">
          🏓 Pong Arena
        </h1>
        <p className="home-subtitle">
          Challenge players worldwide in the ultimate Pong experience
        </p>
        <button 
          className="login-button"
          onClick={() => navigate('/login')}
        >
          Get Started
        </button>
      </div>
    </div>
  );
}

export default Home;