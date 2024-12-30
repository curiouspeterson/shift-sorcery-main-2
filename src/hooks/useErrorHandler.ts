import { useToast } from '@/components/ui/use-toast';
import { useEffect } from 'react';
import { useScheduleStore } from '@/store/scheduleStore';

export function useErrorHandler() {
  const { toast } = useToast();
  const error = useScheduleStore(state => state.error);
  const clearError = useScheduleStore(state => state.clearError);

  useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: error,
        variant: 'destructive',
      });
      clearError();
    }
  }, [error, toast, clearError]);
} 