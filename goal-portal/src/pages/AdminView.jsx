import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useStore } from '../store'
import * as XLSX from 'xlsx'

function computeScore(uom, target, actual) {
  if (actual === null || actual === undefined || actual === '') return null
  const t = Number(target)
  const a = Number(actual)
  if (t === 0 || a === 0) return null
  switch (uom) {
    case 'min': return Math.min((a / t) * 100, 100).toFixed(1)
    case 'max': return Math.min((t / a) * 100, 100).toFixed(1)
    case 'timeline': return Math.min((t / a) * 100, 100).toFixed(1)
    case 'zero': return a === 0 ? '100.0' : '0.0'
    default: return null
  }
}

export default function AdminView() {
  const { currentUser } = useStore()
  const [users, setUsers] = useState([])
  const [goals, setGoals] = useState([])
  const [achievements, setAchievements] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (currentUser) fetchAll()
  }, [currentUser])

  async function fetchAll() {
    const { data: u } = await supabase.from('users').select('*')
    const { data: g } = await supabase.from('goals').select('*')
    const { data: a } = await supabase.from('achievements').select('*')
    const { data: al } = await supabase.from('audit_log').select('*').order('changed_at', { ascending: false })
    setUsers(u || [])
    setGoals(g || [])
    setAchievements(a || [])
    setAuditLog(al || [])
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function getUserName(id) {
    return users.find(u => u.id === id)?.name || id?.slice(0, 8) || '—'
  }

  async function unlockGoal(goalId) {
    await supabase.from('goals').update({ status: 'draft' }).eq('id', goalId)
    await supabase.from('audit_log').insert({
      goal_id: goalId,
      changed_by: currentUser.id,
      field_changed: 'status',
      old_value: 'approved',
      new_value: 'draft (admin unlock)',
    })
    showToast('Goal unlocked!')
    fetchAll()
  }

  function exportReport() {
    const rows = []
    goals.forEach(g => {
      ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
        const ach = achievements.find(a => a.goal_id === g.id && a.quarter === q)
        const score = computeScore(g.uom, g.target, ach?.actual)
        rows.push({
          Employee: getUserName(g.employee_id),
          'Thrust Area': g.thrust_area,
          'Goal Title': g.title,
          'UoM': g.uom,
          'Target': g.target,
          'Weightage (%)': g.weightage,
          'Status': g.status,
          Quarter: q,
          'Actual Achievement': ach?.actual ?? '—',
          'Progress Status': ach?.progress_status ?? '—',
          'Score (%)': score ?? '—',
          'Manager Comment': ach?.manager_comment ?? '—',
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Achievement Report')
    XLSX.writeFile(wb, 'achievement_report.xlsx')
    showToast('Report downloaded!')
  }

  if (!currentUser) return (
    <div className="text-center py-20 text-gray-500">
      Please select a user from the dropdown above
    </div>
  )

  if (currentUser.role !== 'admin') return (
    <div className="text-center py-20 text-gray-500">
      This view is for admins only
    </div>
  )

  const employees = users.filter(u => u.role === 'employee')
  const managers = users.filter(u => u.role === 'manager')
  const submittedGoals = goals.filter(g => g.status === 'submitted')
  const approvedGoals = goals.filter(g => g.status === 'approved')

  // check-in completion: employees who have at least one achievement this quarter
  const employeesWithAchievements = new Set(
    achievements.map(a => goals.find(g => g.id === a.goal_id)?.employee_id)
  )

  // cycle schedule
  const cycleSchedule = [
    { period: 'Goal Setting', window: '1st May', status: 'active' },
    { period: 'Q1 Check-in', window: 'July', status: 'upcoming' },
    { period: 'Q2 Check-in', window: 'October', status: 'upcoming' },
    { period: 'Q3 Check-in', window: 'January', status: 'upcoming' },
    { period: 'Q4 / Annual', window: 'March / April', status: 'upcoming' },
  ]

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow z-50">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {['dashboard', 'goals', 'audit', 'cycle'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'audit' ? 'Audit Log' : tab === 'cycle' ? 'Cycle Schedule' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Overview Dashboard</h2>
            <button
              onClick={exportReport}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Export Achievement Report (.xlsx)
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Employees', value: employees.length, color: 'blue' },
              { label: 'Goals Submitted', value: submittedGoals.length, color: 'yellow' },
              { label: 'Goals Approved', value: approvedGoals.length, color: 'green' },
              { label: 'Check-ins Done', value: employeesWithAchievements.size, color: 'purple' },
            ].map(stat => (
              <div key={stat.label} className={`bg-${stat.color}-50 border border-${stat.color}-200 rounded-lg p-4`}>
                <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Completion table */}
          <h3 className="font-semibold mb-3">Employee Completion Status</h3>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600">Employee</th>
                  <th className="text-left px-4 py-2 text-gray-600">Manager</th>
                  <th className="text-left px-4 py-2 text-gray-600">Goals</th>
                  <th className="text-left px-4 py-2 text-gray-600">Status</th>
                  <th className="text-left px-4 py-2 text-gray-600">Check-in</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const empGoals = goals.filter(g => g.employee_id === emp.id)
                  const hasApproved = empGoals.some(g => g.status === 'approved')
                  const hasCheckin = employeesWithAchievements.has(emp.id)
                  const manager = users.find(u => u.id === emp.manager_id)
                  return (
                    <tr key={emp.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{emp.name}</td>
                      <td className="px-4 py-2 text-gray-500">{manager?.name || '—'}</td>
                      <td className="px-4 py-2">{empGoals.length} goal(s)</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          hasApproved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {hasApproved ? 'Approved' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          hasCheckin ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {hasCheckin ? 'Done' : 'Not started'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Goals Tab */}
      {activeTab === 'goals' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">All Goals</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600">Employee</th>
                  <th className="text-left px-4 py-2 text-gray-600">Goal</th>
                  <th className="text-left px-4 py-2 text-gray-600">UoM</th>
                  <th className="text-left px-4 py-2 text-gray-600">Target</th>
                  <th className="text-left px-4 py-2 text-gray-600">Weight</th>
                  <th className="text-left px-4 py-2 text-gray-600">Status</th>
                  <th className="text-left px-4 py-2 text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {goals.map(g => (
                  <tr key={g.id} className="border-t">
                    <td className="px-4 py-2">{getUserName(g.employee_id)}</td>
                    <td className="px-4 py-2 font-medium">{g.title}</td>
                    <td className="px-4 py-2 uppercase">{g.uom}</td>
                    <td className="px-4 py-2">{g.target}</td>
                    <td className="px-4 py-2">{g.weightage}%</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        g.status === 'approved' ? 'bg-green-100 text-green-700' :
                        g.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                        g.status === 'returned' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {g.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {g.status === 'approved' && (
                        <button
                          onClick={() => unlockGoal(g.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Unlock
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Audit Log</h2>
          {auditLog.length === 0 ? (
            <p className="text-gray-500">No changes logged yet.</p>
          ) : (
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-600">When</th>
                    <th className="text-left px-4 py-2 text-gray-600">Changed By</th>
                    <th className="text-left px-4 py-2 text-gray-600">Field</th>
                    <th className="text-left px-4 py-2 text-gray-600">From</th>
                    <th className="text-left px-4 py-2 text-gray-600">To</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map(log => (
                    <tr key={log.id} className="border-t">
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(log.changed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">{getUserName(log.changed_by)}</td>
                      <td className="px-4 py-2">{log.field_changed}</td>
                      <td className="px-4 py-2 text-red-500">{log.old_value}</td>
                      <td className="px-4 py-2 text-green-600">{log.new_value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Cycle Schedule Tab */}
      {activeTab === 'cycle' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Cycle Schedule</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600">Period</th>
                  <th className="text-left px-4 py-2 text-gray-600">Window Opens</th>
                  <th className="text-left px-4 py-2 text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {cycleSchedule.map(c => (
                  <tr key={c.period} className="border-t">
                    <td className="px-4 py-2 font-medium">{c.period}</td>
                    <td className="px-4 py-2">{c.window}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        c.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.status === 'active' ? 'Active Now' : 'Upcoming'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}