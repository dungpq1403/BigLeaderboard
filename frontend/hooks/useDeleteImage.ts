// hooks/useDeleteImage.ts
import { toast } from 'react-toastify';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';

/**
 * Hook xóa file ảnh trên server. Dùng useMutation để:
 *  - Có sẵn `isPending` thay vì state thủ công.
 *  - Tận dụng auth header tự động của apiFetch.
 *
 * Trả về Promise<boolean> để caller có thể await và quyết định bước tiếp
 * theo (vd. xóa record trong DB chỉ sau khi xóa ảnh thành công).
 */
export function useDeleteImage() {
  const mutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      if (!imageUrl) return true;
      await apiFetch<{ message?: string }>(`/upload/delete-image`, {
        method: 'DELETE',
        body: { imageUrl },
      });
      return true;
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Vui lòng đăng nhập');
      } else {
        console.error('Delete image error:', err);
      }
    },
  });

  // Wrap trả về API tương thích với caller cũ (deleteImage: (url) => Promise<boolean>).
  const deleteImage = async (imageUrl: string): Promise<boolean> => {
    try {
      const result = await mutation.mutateAsync(imageUrl);
      return result;
    } catch {
      return false;
    }
  };

  return { deleteImage, isDeleting: mutation.isPending };
}