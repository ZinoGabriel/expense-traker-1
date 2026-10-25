// Set these values from Supabase Project Settings > API.
// This file is public. Never put a service_role key here.
window.spendGuardSupabase = null;

// Public Netlify function URL for Spendy AI. Keep all API keys in Netlify environment variables.
window.SPENDGUARD_AI_ENDPOINT = '';

const SUPABASE_URL = 'https://erctztcrxrfohykemxnu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyY3R6dGNyeHJmb2h5a2VteG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NDQ1OTAsImV4cCI6MjEwODQyMDU5MH0.WgP4kwKY-j1nUDBtfGirujiYrlp4ohnrkjXgoEWVsZI';

if (
    window.supabase &&
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
) {
    window.spendGuardSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}