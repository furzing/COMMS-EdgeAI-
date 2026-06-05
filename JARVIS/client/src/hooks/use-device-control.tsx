import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DeviceControl } from "@shared/schema";

export function useDeviceControl() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const controlDeviceMutation = useMutation({
    mutationFn: async ({ deviceId, control }: { deviceId: string; control: DeviceControl }) => {
      const response = await apiRequest('POST', `/api/devices/${deviceId}/control`, control);
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      if (data.device) {
        toast({
          title: "Device Controlled",
          description: `${data.device.name} has been ${data.device.isActive ? 'turned on' : 'turned off'}`,
        });
      }
    },
    onError: (error) => {
      console.error('Device control error:', error);
      toast({
        title: "Device Control Failed",
        description: error.message || "Failed to control device",
        variant: "destructive",
      });
    },
  });

  const controlDevice = async (deviceId: string, control: DeviceControl) => {
    return controlDeviceMutation.mutateAsync({ deviceId, control });
  };

  return {
    controlDevice,
    isControlling: controlDeviceMutation.isPending,
  };
}
