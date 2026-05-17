import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useStore } from '../store'

const THRUST_AREAS = [
  'Sales & Revenue',
  'Customer Success',
  'Operations',
  'Product & Innovation',
  'People & Culture',
  'Finance',
  'Technology',
  'Quality & Compliance',
]

const UOM_TYPES = ['min', 'max', 'timeline', 'zero']

function validateGoals(goals) {
  const errors = []
  if (goals.length === 0) errors.push('Add at least one goal')
  if (goals.length > 8) errors.push('Maximum 8 goals allowed')
  if (goals.some(g => Number(g.weightage) < 10))
    errors.push('Each goal must have at least 10% weightage')
  const total = goals.reduce((sum, g) => sum + Number(g.weightage), 0)
  if (total !== 100) errors.push(`Total weightage is ${total}% — must equal exactly 100%`)
  return errors
}

function computeScore(uom, target, actual) {
  if (actual === null || actual === undefined || actual === '') return null
  const t = Number(target)
  const a = Number(actual)
  if (t === 0) return null
  switch (uom) {
    case 'min': return Math.min((a / t) * 100, 100).toFixed(1)
    case 'max': return Math.min((t / a) * 100, 100).toFixed(1)
    case 'timeline': return Math.min((t / a) * 100, 100).toFixed(1)
    case 'zero': return a === 0 ? '100.0' : '0.0'
    default: return null
  }
}

const emptyGoal = () => ({
  thrust_area: THRUST_AREAS[0],
  title: '',
  description: '',
  uom: 'min',
  target: '',
  weightage: '',
})

export default function EmployeeView() {
  const { currentUser } = useStore()
  const [goals, setGoals] = useState([])
  const [form, setForm] = useState([emptyGoal()])
  const [errors, setErrors] = useState([])
  const [toast, setToast] = useState('')
  const [activeTab, setActiveTab] = useState('my-goals')
  const [achievements, setAchievements] = useState({})
  const [quarter, setQuarter] = useState('Q1')

  useEffect(() => {
    if (currentUser) fetchGoals()
  }, [currentUser])

  async function fetchGoals() {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('employee_id', currentUser.id)
    setGoals(data || [])

    // fetch achievements
    if (data && data.length > 0) {
      const goalIds = data.map(g => g.id)
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

  function addGoalRow() {
    if (form.length >= 8) return showToast('Maximum 8 goals allowed')
    setForm([...form, emptyGoal()])
  }

  function removeGoalRow(i) {
    setForm(form.filter((_, idx) => idx !== i))
  }

  function updateForm(i, field, value) {
    const updated = [...form]
    updated[i] = { ...updated[i], [field]: value }
    setForm(updated)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleSubmit() {
    const errs = validateGoals(form)
    if (errs.length > 0) { setErrors(errs); return }
    setErrors([])

    const rows = form.map(g => ({
      ...g,
      employee_id: currentUser.id,
      status: 'submitted',
    }))

    const { error } = await supabase.from('goals').insert(rows)
    if (error) { showToast('Error submitting goals'); return }

    showToast('Goals submitted successfully!')
    setForm([emptyGoal()])
    fetchGoals()
    setActiveTab('my-goals')
  }

  async function saveAchievement(goalId, quarter, field, value) {
    const key = `${goalId}_${quarter}`
    const existing = achievements[key]

    if (existing) {
      await supabase.from('achievements').update({ [field]: value, updated_at: new Date() }).eq('id', existing.id)
    } else {
      await supabase.from('achievements').insert({ goal_id: goalId, quarter, [field]: value })
    }
    fetchGoals()
  }

  if (!currentUser) return (
    <div className="text-center py-20 text-gray-500">
      Please select a user from the dropdown above
    </div>
  )

  if (currentUser.role !== 'employee') return (
    <div className="text-center py-20 text-gray-500">
      This view is for employees only
    </div>
  )

  const approvedGoals = goals.filter(g => g.status === 'approved')
  const pendingGoals = goals.filter(g => g.status === 'submitted')
  const returnedGoals = goals.filter(g => g.status === 'returned')

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow z-50">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {['my-goals', 'create', 'achievements'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'my-goals' ? 'My Goals' : tab === 'create' ? 'Create Goals' : 'Log Achievements'}
          </button>
        ))}
      </div>

      {/* My Goals Tab */}
      {activeTab === 'my-goals' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">My Goals</h2>
          {goals.length === 0 ? (
            <p className="text-gray-500">No goals yet. Go to Create Goals to add some.</p>
          ) : (
            <div className="space-y-3">
              {goals.map(g => (
                <div key={g.id} className="bg-white border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{g.title}</p>
                      <p className="text-sm text-gray-500">{g.thrust_area} · {g.uom.toUpperCase()} · Target: {g.target} · Weight: {g.weightage}%</p>
                      {g.description && <p className="text-sm text-gray-600 mt-1">{g.description}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      g.status === 'approved' ? 'bg-green-100 text-green-700' :
                      g.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                      g.status === 'returned' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {g.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {returnedGoals.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-red-700 text-sm font-medium">
                {returnedGoals.length} goal(s) returned by manager — please edit and resubmit
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create Goals Tab */}
      {activeTab === 'create' && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Create Goals</h2>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              {errors.map((e, i) => <p key={i} className="text-red-600 text-sm">• {e}</p>)}
            </div>
          )}

          <div className="space-y-4">
            {form.map((g, i) => (
              <div key={i} className="bg-white border rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-medium text-sm text-gray-700">Goal {i + 1}</span>
                  {form.length > 1 && (
                    <button onClick={() => removeGoalRow(i)} className="text-red-500 text-sm hover:underline">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Thrust Area</label>
                    <select
                      value={g.thrust_area}
                      onChange={e => updateForm(i, 'thrust_area', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    >
                      {THRUST_AREAS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">UoM Type</label>
                    <select
                      value={g.uom}
                      onChange={e => updateForm(i, 'uom', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    >
                      {UOM_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Goal Title</label>
                    <input
                      value={g.title}
                      onChange={e => updateForm(i, 'title', e.target.value)}
                      placeholder="e.g. Increase monthly sales by 20%"
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Description</label>
                    <textarea
                      value={g.description}
                      onChange={e => updateForm(i, 'description', e.target.value)}
                      placeholder="Optional details..."
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Target</label>
                    <input
                      type="number"
                      value={g.target}
                      onChange={e => updateForm(i, 'target', e.target.value)}
                      placeholder="e.g. 100"
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Weightage (%)</label>
                    <input
                      type="number"
                      value={g.weightage}
                      onChange={e => updateForm(i, 'weightage', e.target.value)}
                      placeholder="e.g. 20"
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Weightage summary */}
          <div className="mt-3 text-sm text-gray-600">
            Total weightage: <span className={`font-bold ${
              form.reduce((s, g) => s + Number(g.weightage || 0), 0) === 100 ? 'text-green-600' : 'text-red-500'
            }`}>
              {form.reduce((s, g) => s + Number(g.weightage || 0), 0)}%
            </span> / 100%
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={addGoalRow}
              className="px-4 py-2 border border-blue-600 text-blue-600 rounded text-sm hover:bg-blue-50"
            >
              + Add Goal
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Submit Goals
            </button>
          </div>
        </div>
      )}

      {/* Achievements Tab */}
      {activeTab === 'achievements' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Log Achievements</h2>
            <select
              value={quarter}
              onChange={e => setQuarter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <option key={q}>{q}</option>)}
            </select>
          </div>

          {approvedGoals.length === 0 ? (
            <p className="text-gray-500">No approved goals yet. Goals must be approved by your manager first.</p>
          ) : (
            <div className="space-y-3">
              {approvedGoals.map(g => {
                const key = `${g.id}_${quarter}`
                const ach = achievements[key] || {}
                const score = computeScore(g.uom, g.target, ach.actual)
                return (
                  <div key={g.id} className="bg-white border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium">{g.title}</p>
                        <p className="text-sm text-gray-500">Target: {g.target} · {g.uom.toUpperCase()} · Weight: {g.weightage}%</p>
                      </div>
                      {score !== null && (
                        <span className="text-sm font-bold text-blue-600">{score}%</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Actual Achievement</label>
                        <input
                          type="number"
                          defaultValue={ach.actual || ''}
                          onBlur={e => saveAchievement(g.id, quarter, 'actual', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm mt-1"
                          placeholder="Enter actual value"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Status</label>
                        <select
                          defaultValue={ach.progress_status || 'not_started'}
                          onBlur={e => saveAchievement(g.id, quarter, 'progress_status', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm mt-1"
                        >
                          <option value="not_started">Not Started</option>
                          <option value="on_track">On Track</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                    {/* Progress bar */}
                    {score !== null && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${Math.min(score, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
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