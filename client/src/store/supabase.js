import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gflnxqrvzlydyjmokyep.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xOGASWnc9dUaavEuTauXxA_dpXax2cy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
  },
});
