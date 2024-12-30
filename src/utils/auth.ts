import { supabase } from "@/integrations/supabase/client";

export const clearAuthData = async () => {
  try {
    // Clear all Supabase-related items from localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) {
        localStorage.removeItem(key);
      }
    });
    
    // Force local sign out without making server request
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.error("Error clearing auth data:", error);
  }
};