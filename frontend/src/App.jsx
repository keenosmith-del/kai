import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import SignIn from './pages/SignIn/SignIn';
import Welcome from './pages/Welcome/Welcome';
import Home from './pages/Home/Home';

function AppRoutes({ user }) {
  const needsWelcome = Boolean(user && !user.onboarding_completed_at);
  const destination = needsWelcome ? '/welcome' : '/';
  return <Routes>
    <Route path="/signin" element={user ? <Navigate replace to={destination}/> : <SignIn/>}/>
    <Route path="/welcome" element={!user ? <Navigate replace to="/signin"/> : needsWelcome ? <Welcome user={user}/> : <Navigate replace to="/"/>}/>
    <Route path="/" element={needsWelcome ? <Navigate replace to="/welcome"/> : <Home user={user}/>}/>
    <Route path="*" element={<Navigate replace to="/"/>}/>
  </Routes>;
}

export default function App() {
  const [state, setState] = useState({ loading: true, error: false, user: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Session service unavailable');
        return response.json();
      })
      .then(data => { if (!controller.signal.aborted) setState({ loading: false, error: false, user: data.user }); })
      .catch(error => { if (error.name !== 'AbortError') setState({ loading: false, error: true, user: null }); });
    return () => controller.abort();
  }, [attempt]);
  if (state.loading) return <main className="kai-loading" aria-live="polite"><span>kai</span></main>;
  if (state.error) return <main style={{minHeight:'100svh',display:'grid',placeContent:'center',textAlign:'center',gap:18,background:'#faf7f0',color:'#302f2a'}}>
    <h1 style={{fontWeight:450}}>Unable to connect to kai.</h1><p>Check your connection and try again.</p>
    <button type="button" style={{borderRadius:50,padding:'12px 20px'}} onClick={() => { setState(old => ({...old,loading:true,error:false})); setAttempt(n=>n+1); }}>Try again</button>
  </main>;
  return <BrowserRouter><AppRoutes user={state.user}/></BrowserRouter>;
}
