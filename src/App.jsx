import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LogIn, ChevronRight, Calculator, Home, ArrowLeft, RefreshCw, LogOut, FileText, Bell, Calendar, User, Settings, Award, BarChart2, Star, Users, MapPin, Clock } from 'lucide-react';

//const API_URL = 'http://localhost:3001/api'; 
const API_URL = 'https://gpacalculator-jysf.onrender.com';

export default function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, grades, gpa, classDetail, attendance, schedule
  const [selectedClass, setSelectedClass] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loadingGrades, setLoadingGrades] = useState(false);

  // Auto-fetch grades once logged in and student is fully selected
  useEffect(() => {
    if (session && session.token && session.studentName) {
      setLoadingGrades(true);
      setActiveTab('overview');
      axios.get(`${API_URL}/grades`, { headers: { Authorization: `Bearer ${session.token}` } }).then(res => {
        setClasses(res.data.classes || []);
        setLoadingGrades(false);
      }).catch(() => setLoadingGrades(false));
    }
  }, [session?.studentName, session?.token]);

  if (!session) {
    return <LoginScreen setSession={setSession} />;
  }

  // Intermediate state for selecting a student if the parent has multiple kids on HAC
  if (session && session.pendingStudents && !session.studentName) {
    return <StudentPickerScreen session={session} setSession={setSession} />;
  }

  if (activeTab === 'classDetail' && selectedClass) {
    return <ClassDetail
      session={session}
      classInfo={selectedClass}
      onBack={() => { setActiveTab('grades'); setSelectedClass(null); }}
    />;
  }

  const initial = session.studentName ? session.studentName.charAt(0).toUpperCase() : 'S';

  const renderHeaderTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Overview';
      case 'grades': return 'Grades';
      case 'gpa': return 'GPA Calculator';
      case 'attendance': return 'Attendance';
      case 'schedule': return 'Class Schedule';
      default: return 'GradeWay';
    }
  };

  return (
    <div className="flex-col w-full min-h-screen animate-fade" style={{ paddingBottom: '90px', background: '#f6f7f9' }}>

      {activeTab !== 'attendance' && activeTab !== 'schedule' ? (
        <nav className="navbar" style={{ background: 'var(--brand-green)', color: 'white', borderBottom: 'none', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex-col">
            <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{renderHeaderTitle()}</span>
            {activeTab === 'overview' && <span className="text-small" style={{ opacity: 0.9, fontWeight: 500 }}>{session.studentName}</span>}
          </div>

          <div
            onClick={() => {
              if (session.pendingStudents && session.pendingStudents.length > 1) {
                setSession({ ...session, studentName: null }); setClasses([]);
              } else {
                setSession(null); setClasses([]);
              }
            }}
            style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer' }}>
            {initial}
          </div>
        </nav>
      ) : null}

      <main className="container flex-col gap-6 pt-4 px-4 h-full" style={{ maxWidth: '600px', margin: '0 auto', flex: 1 }}>
        {activeTab === 'overview' && <OverviewScreen setTab={setActiveTab} />}
        {activeTab === 'grades' && <GradesScreen classes={classes} loading={loadingGrades} openClass={(c) => { setSelectedClass(c); setActiveTab('classDetail'); }} />}
        {activeTab === 'gpa' && <GPACalculatorScreen session={session} />}
        {activeTab === 'attendance' && <AttendanceScreen session={session} onBack={() => setActiveTab('overview')} />}
        {activeTab === 'schedule' && <ScheduleScreen session={session} onBack={() => setActiveTab('overview')} />}
      </main>

      <div className="bottom-nav">
        <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <Home size={26} />
        </button>
        <button className={`nav-item ${activeTab === 'grades' ? 'active' : ''}`} onClick={() => setActiveTab('grades')}>
          <Award size={26} />
        </button>
        <button className={`nav-item ${activeTab === 'gpa' ? 'active' : ''}`} onClick={() => setActiveTab('gpa')}>
          <BarChart2 size={26} />
        </button>
        <button className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
          <Calendar size={26} />
        </button>
        <button className="nav-item" onClick={() => {
          if (session.pendingStudents && session.pendingStudents.length > 1) {
            setSession({ ...session, studentName: null }); setClasses([]);
          } else {
            setSession(null); setClasses([]);
          }
        }}>
          <Settings size={26} />
        </button>
      </div>
    </div>
  );
}

// --- STUDENT PICKER SCREEN ---
function StudentPickerScreen({ session, setSession }) {
  const [loadingId, setLoadingId] = useState(null);

  const handleSelectStudent = async (student) => {
    setLoadingId(student.id);
    try {
      const res = await axios.post(`${API_URL}/selectStudent`, { token: session.token, studentId: student.id });
      if (res.data.success) {
        setSession({ token: session.token, studentName: student.name, pendingStudents: session.pendingStudents });
      } else {
        alert('Failed to switch to ' + student.name);
      }
    } catch (e) {
      alert('Error fetching ' + student.name + "'s data.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="container flex-col animate-fade" style={{ minHeight: '100vh', background: '#f6f7f9', padding: '2rem 1rem' }}>
      <div className="flex-col items-center justify-center text-center gap-2 mb-8 mt-10">
        <div style={{ background: 'var(--brand-green)', color: 'white', padding: '1rem', borderRadius: '50%' }}>
          <Users size={32} />
        </div>
        <h1 className="h1 mt-2" style={{ color: '#333' }}>Select Student</h1>
        <p className="text-secondary" style={{ maxWidth: '300px' }}>Which student profile would you like to view right now?</p>
      </div>

      <div className="flex-col gap-4" style={{ maxWidth: '400px', margin: '0 auto', width: '100%' }}>
        {session.pendingStudents.map((student) => (
          <div
            key={student.id}
            className="card flex-row justify-between items-center cursor-pointer"
            style={{ padding: '1.2rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}
            onClick={() => !loadingId && handleSelectStudent(student)}
          >
            <div className="flex-col">
              <span className="h3" style={{ color: '#2b2b2b' }}>{student.name}</span>
              <span className="text-small" style={{ color: 'var(--brand-green)', fontWeight: 'bold' }}>{student.grade}</span>
            </div>

            {loadingId === student.id ? (
              <RefreshCw className="animate-spin text-tertiary" size={20} />
            ) : (
              <ChevronRight className="text-tertiary" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- OVERVIEW SCREEN ---
function OverviewScreen({ setTab }) {
  const menuItems = [
    { icon: <User className="text-brand-green" />, title: 'Attendance', desc: 'View your absences', action: 'attendance' },
    { icon: <Calendar className="text-brand-green" />, title: 'Class Schedule', desc: 'View classes and periods', action: 'schedule' },
    { icon: <LogOut className="text-brand-green" style={{ transform: 'rotate(180deg)' }} />, title: 'Contact Teachers', desc: 'Email your teachers', action: null },
    { icon: <Award className="text-brand-green" />, title: 'Progress Report', desc: 'View interim scores', action: 'grades' },
    { icon: <FileText className="text-brand-green" />, title: 'Report Card', desc: 'View reporting period scores', action: 'grades' },
    { icon: <Award className="text-brand-green" />, title: 'Transcript', desc: 'View your credits', action: 'grades' },
  ];

  return (
    <div className="flex-col gap-3 animate-slide-up stagger-1">
      <div className="menu-card" style={{ padding: '1.2rem', borderColor: '#fcd34d', borderWidth: '2px' }} onClick={() => setTab('gpa')}>
        <div style={{ background: 'var(--brand-green)', color: 'white', padding: '0.6rem', borderRadius: '0.8rem', display: 'flex', alignItems: 'center' }}>
          <ChevronRight style={{ transform: 'rotate(-90deg)' }} size={24} />
        </div>
        <div className="flex-col flex-1 pl-2">
          <span className="h4" style={{ fontSize: '1.2rem', color: '#333' }}>Upgrade to Premium</span>
          <span className="text-small" style={{ color: '#666' }}>Take GradeWay to the next level</span>
        </div>
        <ChevronRight style={{ color: '#aaa' }} />
      </div>

      <div className="flex-col gap-2 mt-2 pb-10">
        {menuItems.map((item, idx) => (
          <div key={idx} className="menu-card" onClick={() => item.action ? setTab(item.action) : alert("Under construction")} style={{ padding: '0.8rem 1rem' }}>
            <div style={{ background: '#e0f2e6', padding: '0.6rem', borderRadius: '0.8rem', display: 'flex', alignItems: 'center' }}>
              {item.icon}
            </div>
            <div className="flex-col flex-1 pl-2">
              <span className="h4" style={{ fontSize: '1.1rem', color: '#444' }}>{item.title}</span>
              <span className="text-small" style={{ color: '#888' }}>{item.desc}</span>
            </div>
            <ChevronRight style={{ color: '#ccc' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- SCHEDULE SCREEN ---
function ScheduleScreen({ session, onBack }) {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/schedule`, { headers: { Authorization: `Bearer ${session.token}` } }).then(res => {
      setSchedule(res.data.schedule || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [session.token]);

  return (
    <div className="flex-col w-full bg-color animate-fade" style={{ margin: '-1rem -1rem 0 -1rem' }}>
      <nav className="navbar" style={{ position: 'sticky', top: 0, background: 'var(--brand-green)', color: 'white', padding: '1rem', display: 'flex' }}>
        <button className="btn-icon" onClick={onBack} style={{ color: 'white', background: 'transparent', border: 'none' }}><ArrowLeft size={24} /></button>
        <span className="h3 flex-1 text-center" style={{ fontWeight: 800 }}>Class Schedule</span>
        <div style={{ width: 40 }}></div>
      </nav>

      <div className="flex-col gap-4 p-4 mt-2 mb-10">
        {loading ? (
          <p className="text-center text-secondary py-10 animate-pulse">Syncing Classes...</p>
        ) : schedule.length === 0 ? (
          <p className="text-center text-secondary py-10">No live schedule found.</p>
        ) : (
          schedule.map((item, i) => (
            <div key={i} className="card flex-col gap-2" style={{ borderLeft: '6px solid var(--brand-green)' }}>
              <div className="flex-row justify-between items-start">
                <div className="flex-col">
                  <span className="h4" style={{ color: '#333' }}>{item.description || item.course}</span>
                  <span className="text-small font-bold" style={{ color: 'var(--brand-green)' }}>{item.teacher}</span>
                </div>
                <span className="badge" style={{ background: '#333', color: 'white' }}>P{item.period}</span>
              </div>
              <div className="flex-row gap-4 mt-2 pt-2" style={{ borderTop: '1px solid #eee' }}>
                <div className="flex-row items-center gap-1 text-small text-secondary">
                  <MapPin size={14} /> <span>Room {item.room || 'N/A'}</span>
                </div>
                <div className="flex-row items-center gap-1 text-small text-secondary">
                  <Clock size={14} /> <span>{item.days || 'M-F'}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --- ATTENDANCE SCREEN ---
function AttendanceScreen({ session, onBack }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/attendance`, { headers: { Authorization: `Bearer ${session.token}` } }).then(res => {
      setEvents(res.data.events || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [session.token]);

  return (
    <div className="flex-col w-full bg-color animate-fade" style={{ margin: '-1rem -1rem 0 -1rem' }}>
      <nav className="navbar" style={{ position: 'sticky', top: 0, background: 'var(--accent-gradient)', color: 'white', padding: '1rem', display: 'flex' }}>
        <button className="btn-icon" onClick={onBack} style={{ color: 'white', background: 'transparent', border: 'none' }}><ArrowLeft size={24} /></button>
        <span className="h3 flex-1 text-center" style={{ fontWeight: 800 }}>Attendance</span>
        <div style={{ width: 40 }}></div>
      </nav>

      <div className="card text-center flex-col items-center py-6 mx-4 mt-6" style={{ background: '#1c1c1e', color: 'white', borderRadius: '1rem' }}>
        <span className="text-body mb-1" style={{ color: '#aaa' }}>Total Absences Scanned</span>
        <span className="badge" style={{ fontSize: '3rem', background: 'transparent', color: '#ffb347', border: '4px solid #ffb347', padding: '1rem', borderRadius: '50%', minWidth: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {events.length}
        </span>
      </div>

      <div className="flex-col gap-3 p-4 pb-10 mt-2">
        <span className="text-small font-bold px-2 text-secondary uppercase">Recent Incidents</span>
        {loading ? (
          <p className="text-center text-secondary py-4 animate-pulse">Syncing events from school...</p>
        ) : events.length === 0 ? (
          <p className="text-center text-secondary py-4">You have perfect attendance!</p>
        ) : (
          events.map((evt, i) => (
            <div key={i} className="menu-card" style={{ padding: '1rem', borderLeft: '4px solid #ffb347' }}>
              <div style={{ background: '#fff0db', padding: '0.6rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', color: '#f39c12' }}>
                <Calendar size={24} />
              </div>
              <div className="flex-col flex-1 pl-2">
                <span className="h4" style={{ fontSize: '1rem' }}>{evt.date}</span>
                <span className="text-small" style={{ color: '#666' }}>{evt.reason || 'Recorded Incident'}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --- GRADES SCREEN ---
function GradesScreen({ classes, loading, openClass }) {
  if (loading) return <div className="text-center p-8 animate-pulse text-secondary">Syncing grades with HAC...</div>;
  if (!classes || classes.length === 0) return <div className="text-center p-8 text-secondary">No current class grades discovered in HAC.</div>;

  const validGrades = classes.filter(c => c.grade > 0);
  const average = validGrades.length > 0 ? validGrades.reduce((acc, curr) => acc + curr.grade, 0) / validGrades.length : 0;

  return (
    <div className="flex-col gap-6 animate-slide-up stagger-2">
      <div className="card glass flex-row justify-between" style={{ background: 'var(--brand-green)', color: 'white', border: 'none' }}>
        <div className="flex-col gap-1">
          <span className="text-small" style={{ color: 'rgba(255,255,255,0.9)' }}>Overall Current Average</span>
          <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>{average > 0 ? average.toFixed(1) : 'NaN'}</span>
        </div>
        <div className="circular-progress" style={{ width: '80px', height: '80px', '--value': average, borderColor: 'rgba(255,255,255,0.2)' }}>
          <div className="circular-progress-value" style={{ fontSize: '1.5rem', color: 'white' }}>
            {average > 89.5 ? 'A' : average > 79.5 ? 'B' : average > 69.5 ? 'C' : '?'}
          </div>
        </div>
      </div>

      <div className="flex-col gap-3 pb-8">
        {classes.map((cls, i) => (
          <div key={cls.id || i} className="menu-card" onClick={() => openClass(cls)}>
            <div className="flex-col flex-1 gap-1">
              <span className="h4" style={{ fontSize: '1rem', color: '#444' }}>{cls.name}</span>
              <span className="text-small text-accent">{cls.instructor} • P{cls.period}</span>
            </div>
            <div className="flex-row gap-3 items-center">
              <span className={`badge badge-${cls.letter}`} style={{ fontSize: '1.2rem', padding: '0.4rem 0.8rem', borderRadius: '0.6rem' }}>
                {cls.grade > 0 ? `${cls.grade}%` : '--'}
              </span>
              <ChevronRight size={18} className="text-tertiary" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- PROJECTED GPA CALCULATOR SCREEN ---
function GPACalculatorScreen({ session }) {
  const [transcriptClasses, setTranscriptClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session && session.token) {
      axios.get(`${API_URL}/transcript`, {
        headers: { Authorization: `Bearer ${session.token}` }
      }).then(res => {
        setTranscriptClasses(res.data.classes || []);
        loading !== false && setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [session?.token]);

  if (loading) return <div className="text-center p-8 animate-pulse text-secondary">Loading Grade 9 Transcript...</div>;

  let totalPoints = 0;
  let validCount = 0;

  const activeGPAClasses = transcriptClasses.filter(c => c.grade > 0).map(c => {
    let pts = 0;
    if (c.grade >= 89.5) pts = 4.0;
    else if (c.grade >= 79.5) pts = 3.0;
    else if (c.grade >= 69.5) pts = 2.0;
    else if (c.grade >= 59.5) pts = 1.0;

    totalPoints += pts;
    validCount++;
    return { ...c, pts };
  });

  const gpa = validCount > 0 ? (totalPoints / validCount).toFixed(2) : '0.00';

  return (
    <div className="flex-col gap-6 animate-slide-up stagger-1 pb-10">
      <div className="card text-center flex-col items-center py-8" style={{ background: '#f8fdf9', border: '2px solid #e0f2e6' }}>
        <span className="text-body mb-2" style={{ color: '#444', fontWeight: 'bold' }}>Grade 9 Unweighted GPA</span>
        <span style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--brand-green)', lineHeight: 1 }}>
          {gpa}
        </span>
        <span className="text-small mt-3 font-bold" style={{ color: '#88a' }}>Calculated from {validCount} core transcript classes.</span>
      </div>

      <div className="flex-col gap-3 mt-2">
        <span className="text-small font-bold px-2" style={{ color: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>Point Breakdown (Grade 9)</span>
        {activeGPAClasses.map((cls, i) => (
          <div key={i} className="menu-card py-4">
            <div className="flex-col flex-1 gap-1">
              <span className="h4" style={{ fontSize: '0.95rem', color: '#444' }}>{cls.name}</span>
            </div>
            <div className="flex-row gap-4 items-center">
              <span className="text-body font-bold" style={{ color: '#888' }}>{cls.grade}%</span>
              <span className="badge" style={{ background: 'var(--brand-green)', color: 'white', minWidth: '3.5rem', textAlign: 'center', fontSize: '1rem', padding: '0.3rem' }}>{cls.pts.toFixed(1)}</span>
            </div>
          </div>
        ))}
        {activeGPAClasses.length === 0 && <div className="text-center text-secondary py-8">No numerical grades found in Grade 9.</div>}
      </div>
    </div>
  );
}


// --- LOGIN SCREEN ---
function LoginScreen({ setSession }) {
  const [district, setDistrict] = useState('https://accesscenter.roundrockisd.org/HomeAccess');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/login`, { districtUrl: district, username, password });
      if (res.data.success) {
        if (res.data.students && res.data.students.length > 0) {
          setSession({ token: res.data.token, pendingStudents: res.data.students });
        } else {
          setSession({ token: res.data.token, studentName: 'Student' });
        }
      } else {
        alert(res.data.error || 'Login failed.');
      }
    } catch (err) {
      alert(`Login failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container flex-col justify-center animate-fade" style={{ minHeight: '100vh', background: 'white' }}>
      <div className="card flex-col gap-6" style={{ maxWidth: '400px', margin: '0 auto', width: '100%', boxShadow: 'none', border: 'none' }}>
        <div className="flex-col items-center justify-center text-center gap-2">
          <div className="btn-icon" style={{ background: 'var(--brand-green)', color: 'white', width: '80px', height: '80px', borderRadius: '1.5rem', border: 'none' }}>
            <Award size={40} />
          </div>
          <h1 className="h1 mt-4" style={{ fontSize: '2rem' }}>GradeWay</h1>
          <p className="text-small" style={{ color: '#888' }}>Re-imagined for Round Rock ISD</p>
        </div>

        <form className="flex-col gap-4 mt-6" onSubmit={handleLogin}>
          <div className="input-group">
            <input type="text" className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Student ID" required style={{ borderRadius: '1rem', padding: '1rem', background: '#f6f7f9', border: 'none' }} />
          </div>
          <div className="input-group">
            <input type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required style={{ borderRadius: '1rem', padding: '1rem', background: '#f6f7f9', border: 'none' }} />
          </div>

          <button type="submit" className="btn mt-4" disabled={loading} style={{ background: 'var(--brand-green)', color: 'white', borderRadius: '1rem', padding: '1.2rem', fontSize: '1.1rem', fontWeight: 'bold', justifyContent: 'center' }}>
            {loading ? <RefreshCw className="animate-spin" size={20} /> : null}
            {loading ? 'Authenticating with School...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// --- CLASS DETAIL (WHAT-IF CALCULATOR) ---
function ClassDetail({ session, classInfo, onBack }) {
  const [assignments, setAssignments] = useState([]);
  const [whatIfGrades, setWhatIfGrades] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/class/${classInfo.id}`, { headers: { Authorization: `Bearer ${session.token}` } }).then(res => {
      setAssignments(res.data.assignments || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [classInfo.id, session.token]);

  const dummyAssignments = assignments.length > 0 ? assignments : [
    { name: 'Unit 4 Exam', max: 100, earned: classInfo.grade || 85 },
    { name: 'Pop Quiz', max: 20, earned: Math.round(((classInfo.grade || 85) / 100) * 20) },
    { name: 'Homework 12', max: 10, earned: 10 }
  ];

  const handleWhatIf = (index, value) => {
    setWhatIfGrades({ ...whatIfGrades, [index]: parseFloat(value) });
  };

  let earned = 0; let max = 0;
  dummyAssignments.forEach((a, i) => {
    let v = whatIfGrades[i] !== undefined ? whatIfGrades[i] : (a.grade || a.earned);
    if (!isNaN(v)) { earned += v; max += a.max; }
  });
  const projectedGrade = max > 0 ? (earned / max) * 100 : classInfo.grade;

  return (
    <div className="flex-col w-full min-h-screen bg-color animate-fade pb-20">
      <nav className="navbar" style={{ position: 'sticky', top: 0, background: 'white', color: '#333' }}>
        <button className="btn-icon" onClick={onBack} style={{ color: 'var(--brand-green)', background: '#f8fdf9' }}><ArrowLeft size={24} /></button>
        <span className="h4 line-clamp-1 flex-1 text-center" style={{ fontSize: '1.1rem' }}>{classInfo.name}</span>
        <div style={{ width: 40 }}></div>
      </nav>

      <div className="container flex-col gap-6 pt-4 px-4 overflow-y-auto w-full max-w-[600px] mx-auto" style={{ maxWidth: '600px', margin: '0 auto' }}>

        <div className="card text-center flex-col items-center py-8" style={{ background: '#111', color: 'white', borderRadius: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
          <span className="text-body mb-2" style={{ color: '#aaa', fontWeight: 'bold' }}>What If Calculator</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--brand-green)', lineHeight: 1 }}>
              {projectedGrade.toFixed(2)}
            </span>
          </div>
          {Object.keys(whatIfGrades).length > 0 && (
            <span className="badge mt-4" style={{ background: 'var(--brand-green)', color: 'white', padding: '0.4rem 1rem' }}>
              Grades Modified
            </span>
          )}
        </div>

        <div className="flex-col gap-3 mt-2">
          <span className="text-small font-bold px-2" style={{ color: '#999', textTransform: 'uppercase', letterSpacing: '1px' }}>Assignments</span>
          {loading && <p className="text-secondary text-center py-4">Scanning assignments...</p>}
          {!loading && dummyAssignments.map((a, i) => (
            <div key={i} className="menu-card py-4" style={{ background: 'white', borderRadius: '1rem' }}>
              <div className="flex-col flex-1">
                <span className="h4" style={{ fontSize: '1.05rem', color: '#444' }}>{a.name || a.title}</span>
                <span className="text-small" style={{ color: '#888' }}>Max Points: {a.max}</span>
              </div>
              <div className="flex-row items-center gap-2">
                <input
                  type="number"
                  className="input-field"
                  style={{ width: '70px', textAlign: 'center', fontWeight: 'bold', border: '2px solid #e0f2e6', background: '#f8fdf9', padding: '0.5rem', borderRadius: '0.5rem' }}
                  placeholder={a.grade || a.earned}
                  onChange={(e) => handleWhatIf(i, e.target.value)}
                  value={whatIfGrades[i] !== undefined ? whatIfGrades[i] : ''}
                />
                <span style={{ color: '#888', fontWeight: 'bold' }}>/ {a.max}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
