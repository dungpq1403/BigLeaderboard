// hooks/useDeleteImage.ts
import { useState } from 'react';
import { toast } from 'react-toastify';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export function useDeleteImage() {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteImage = async (imageUrl: string): Promise<boolean> => {
    if (!imageUrl) return true;
    
    setIsDeleting(true);
    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập');
        return false;
      }
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/upload/delete-image`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageUrl }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Delete image failed:', data.message);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Delete image error:', error);
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteImage, isDeleting };
}