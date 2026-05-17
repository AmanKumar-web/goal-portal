import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useStore } from '../store'

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

export default function ManagerView() {
  const { currentUser } = useStore()
  const [teamGoals, setTeamGoals] = useState([])
  const [employees, setEmployees] = useState([])
  const [achievements, setAchievements] = useState({})
  const [editingGoal, setEditingGoal] = useState(null)
  const [toast, setToast] = useState('')
  const [activeTab, setActiveTab] = useState('approvals')
  const [quarter, setQuarter] = useState('Q1')
  const [comments, setComments] = useState({})

  useEffect(() => {
    if (currentUser) fetchTeamData()
  }, [currentUser])

  async function fetchTeamData() {
    // get employees under this manager
    const { data: emps } = await supabase
      .from('users')
      .select('*')
      .eq('manager_id', currentUser.id)
    setEmployees(emps || [])

    if (!emps || emps.length === 0) return

    const empIds = emps.map(e => e.id)

    // get all their goals
    const { data: goals } = await supabase
      .from('goals')
      .select('*')
      .in('employee_id', empIds)
    setTeamGoals(goals || [])

    // get achievements
    if (goals && goals.length > 0) {
      const goalIds = goals.map(g => g.id)
      const { data: ach } = await supabase
        .from('achievements')
        .select('*')
        .in('goal_id', goalIds)
      const map = {}
      ;(ach || []).forEach(a => {
        map[`${a.goal_id}_${a.quarter}`] = a
      })
      setAchievements(map)
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function getEmployeeName(id) {
    return employees.find(e => e.id === id)?.name || 'Unknown'
  }

  async function handleApprove(goal) {
    const updates = editingGoal?.id === goal.id
      ? { status: 'approved', target: editingGoal.target, weightage: editingGoal.weightage }
      : { status: 'approved' }

    await supabase.from('goals').update(updates).eq('id', goal.id)

    // audit log
    await supabase.from('audit_log').insert({
      goal_id: goal.id,
      changed_by: currentUser.id,
      field_changed: 'status',
      old_value: 'submitted',
      new_value: 'approved',
    })

    showToast('Goal approved and locked!')
    setEditingGoal(null)
    fetchTeamData()
  }

  async function handleReturn(goal) {
    await supabase.from('goals').update({ status: 'returned' }).eq('id', goal.id)
    await supabase.from('audit_log').insert({
      goal_id: goal.id,
      changed_by: currentUser.id,
      field_changed: 'status',
      old_value: 'submitted',
      new_value: 'returned',
    })
    showToast('Goal returned to employee')
    fetchTeamData()
  }

  async function saveComment(goalId, quarter, comment) {
    const key = `${goalId}_${quarter}`
    const existing = achievements[key]
    if (existing) {
      await supabase.from('achievements').update({ manager_comment: comment }).eq('id', existing.id)
    } else {
      await supabase.from('achievements').insert({ goal_id: goalId, quarter, manager_comment: comment })
    }
    showToast('Comment saved!')
    fetchTeamData()
  }

  if (!currentUser) return (
    <div className="text-center py-20 text-gray-500">
      Please select a user from the dropdown above
    </div>
  )

  if (currentUser.role !== 'manager') return (
    <div className="text-center py-20 text-gray-500">
      This view is for managers only
    </div>
  )

  const submittedGoals = teamGoals.filter(g => g.status === 'submitted')
  const approvedGoals = teamGoals.filter(g => g.status === 'approved')

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow z-50">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {['approvals', 'checkins'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'approvals'
              ? `Pending Approvals ${submittedGoals.length > 0 ? `(${submittedGoals.length})` : ''}`
              : 'Quarterly Check-ins'}
          </button>
        ))}
      </div>

      {/* Approvals Tab */}
      {activeTab === 'approvals' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Team Goal Approvals</h2>
          {submittedGoals.length === 0 ? (
            <p className="text-gray-500">No pending goals to review.</p>
          ) : (
            <div className="space-y-4">
              {submittedGoals.map(g => (
                <div key={g.id} className="bg-white border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{g.title}</p>
                      <p className="text-sm text-gray-500">
                        {getEmployeeName(g.employee_id)} · {g.thrust_area} · {g.uom.toUpperCase()}
                      </p>
                    </div>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                      Pending
                    </span>
                  </div>

                  {g.description && (
                    <p className="text-sm text-gray-600 mb-3">{g.description}</p>
                  )}

                  {/* Inline editing */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-500">Target</label>
                      <input
                        type="number"
                        defaultValue={g.target}
                        onChange={e => setEditingGoal({ id: g.id, target: e.target.value, weightage: editingGoal?.weightage || g.weightage })}
                        className="w-full border rounded px-2 py-1 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Weightage (%)</label>
                      <input
                        type="number"
                        defaultValue={g.weightage}
                        onChange={e => setEditingGoal({ id: g.id, weightage: e.target.value, target: editingGoal?.target || g.target })}
                        className="w-full border rounded px-2 py-1 text-sm mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(g)}
                      className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Approve & Lock
                    </button>
                    <button
                      onClick={() => handleReturn(g)}
                      className="px-4 py-1.5 bg-red-100 text-red-600 text-sm rounded hover:bg-red-200"
                    >
                      Return for Rework
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Check-ins Tab */}
      {activeTab === 'checkins' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Quarterly Check-ins</h2>
            <select
              value={quarter}
              onChange={e => setQuarter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q}>{q}</option>)}
            </select>
          </div>

          {approvedGoals.length === 0 ? (
            <p className="text-gray-500">No approved goals yet.</p>
          ) : (
            <div className="space-y-4">
              {employees.map(emp => {
                const empGoals = approvedGoals.filter(g => g.employee_id === emp.id)
                if (empGoals.length === 0) return null
                return (
                  <div key={emp.id} className="bg-white border rounded-lg p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">{emp.name}</h3>
                    <div className="space-y-3">
                      {empGoals.map(g => {
                        const key = `${g.id}_${quarter}`
                        const ach = achievements[key] || {}
                        const score = computeScore(g.uom, g.target, ach.actual)
                        return (
                          <div key={g.id} className="border-l-4 border-blue-200 pl-3">
                            <div className="flex justify-between items-center">
                              <p className="text-sm font-medium">{g.title}</p>
                              {score !== null && (
                                <span className="text-sm font-bold text-blue-600">{score}%</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mb-2">
                              Target: {g.target} · Actual: {ach.actual || '—'} · Status: {ach.progress_status || 'not started'}
                            </p>
                            {score !== null && (
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                                <div
                                  className="bg-blue-500 h-1.5 rounded-full"
                                  style={{ width: `${Math.min(score, 100)}%` }}
                                />
                              </div>
                            )}
                            <div>
                              <label className="text-xs text-gray-500">Manager Comment</label>
                              <div className="flex gap-2 mt-1">
                                <input
                                  defaultValue={ach.manager_comment || ''}
                                  onChange={e => setComments({ ...comments, [key]: e.target.value })}
                                  placeholder="Add check-in comment..."
                                  className="flex-1 border rounded px-2 py-1 text-sm"
                                />
                                <button
                                  onClick={() => saveComment(g.id, quarter, comments[key] || ach.manager_comment)}
                                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}