import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fyoctiotfcdtjshdbqap.supabase.co';
const supabaseKey = 'sb_publishable_w3jQZYS3Ez4MI_uZBjX48Q_8N7VDqT0';

export const supabase = createClient(supabaseUrl, supabaseKey);
