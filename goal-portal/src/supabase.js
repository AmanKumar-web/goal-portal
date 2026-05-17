import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://beowblmlctyryjcyknzu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlb3dibG1sY3R5cnlqY3lrbnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjMyNDksImV4cCI6MjA5NDUzOTI0OX0.5Rk617Pg3AO11zImYhVqzqQyD7mYKFAYSqxm_Vcyd9E'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)