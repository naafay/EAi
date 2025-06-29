import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://dmlmtkpdnycjzoiajdgq.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbG10a3BkbnljanpvaWFqZGdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwOTMxNzAsImV4cCI6MjA2NjY2OTE3MH0.02iZpq-skA2AiVph37xr_Pxz67T20wm-hRC67fhnuRQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
