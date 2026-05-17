import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useStore } from './store'
import EmployeeView from './pages/EmployeeView'
import ManagerView from './pages/ManagerView'
import AdminView from './pages/AdminView'
import { supabase } from './supabase'
import { useEffect, useState } from 'react'

function Navbar() {
  const { currentUser, setUser } = useStore()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])

  useEffect(() => {
    supabase.from('users').select('*').then(({ data }) => setUsers(data || []))
  }, [])

  function handleSwitch(e) {
    const user = users.find(u => u.id === e.target.value)
    setUser(user)
    if (user.role === 'employee') navigate('/employee')
    if (user.role === 'manager') navigate('/manager')
    if (user.role === 'admin') navigate('/admin')
  }

  return (
    <nav className="bg-blue-700 text-white px-6 py-3 flex justify-between items-center">
      <h1 className="text-xl font-bold">Goal Portal</h1>
      <div className="flex items-center gap-3">
        {currentUser && (
          <span className="text-sm opacity-80">
            {currentUser.name} ({currentUser.role})
          </span>
        )}
        <select
          onChange={handleSwitch}
          defaultValue=""
          className="text-black rounded px-2 py-1 text-sm"
        >
          <option value="" disabled>Switch User</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
          ))}
        </select>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/employee" />} />
          <Route path="/employee" element={<EmployeeView />} />
          <Route path="/manager" element={<ManagerView />} />
          <Route path="/admin" element={<AdminView />} />
        </Routes>
      </div>
    </div>
  )
}