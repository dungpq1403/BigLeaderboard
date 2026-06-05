"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import styles from './CreateGameForm.module.css';
import { useDeleteImage } from '@/hooks/useDeleteImage';
import { apiFetch, ApiError } from '@/lib/api';

interface CreateGameFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function CreateGameForm({ onSuccess, onCancel }: CreateGameFormProps) {
  const { deleteImage } = useDeleteImage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    icon: '🎮',
    description: '',
    imageUrl: '',
    backgroundImage: '',
    rating: '',
    players: '',
    releaseDate: '',
    developer: '',
    publisher: '',
    platforms: [''],
    genre: [''],
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleArrayChange = (field: 'platforms' | 'genre', index: number, value: string) => {
    const newArray = [...formData[field]];
    newArray[index] = value;
    setFormData(prev => ({ ...prev, [field]: newArray }));
  };

  const addArrayItem = (field: 'platforms' | 'genre') => {
    setFormData(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const removeArrayItem = (field: 'platforms' | 'genre', index: number) => {
    const newArray = formData[field].filter((_, i) => i !== index);
    if (newArray.length === 0) newArray.push('');
    setFormData(prev => ({ ...prev, [field]: newArray }));
  };

  const generateSlug = () => {
    if (formData.name) {
      const slug = formData.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  // Một mutation duy nhất xử lý cả 2 endpoint upload. Phân biệt qua `type`
  // trong mutationFn; isPending sẽ thay cho 2 state `uploadingImage` và
  // `uploadingBackground` cũ — nhưng cần biết loại nào đang upload.
  // Dùng `variables` để derive.
  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: 'image' | 'background' }) => {
      const fd = new FormData();
      fd.append('image', file);
      const endpoint = type === 'image' ? '/upload/game-image' : '/upload/game-background';
      return apiFetch<{ imageUrl: string }>(endpoint, { method: 'POST', body: fd });
    },
    onSuccess: (data, vars) => {
      if (vars.type === 'image') {
        setFormData((prev) => ({ ...prev, imageUrl: data.imageUrl }));
        toast.success('Upload ảnh game thành công!');
      } else {
        setFormData((prev) => ({ ...prev, backgroundImage: data.imageUrl }));
        toast.success('Upload ảnh nền thành công!');
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Vui lòng đăng nhập');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Upload thất bại';
      toast.error(msg);
    },
  });
  const uploadingImage = uploadMutation.isPending && uploadMutation.variables?.type === 'image';
  const uploadingBackground =
    uploadMutation.isPending && uploadMutation.variables?.type === 'background';

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'background',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > (type === 'image' ? 5 : 10) * 1024 * 1024) {
      toast.error(`Ảnh ${type === 'image' ? 'game' : 'nền'} không được vượt quá ${type === 'image' ? '5' : '10'}MB`);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Chỉ chấp nhận file JPEG, PNG, GIF, WEBP');
      return;
    }

    uploadMutation.mutate({ file, type });
  };

  const createMutation = useMutation({
    mutationFn: (submitData: Record<string, unknown>) =>
      apiFetch<{ id?: number; message?: string }>(`/games`, {
        method: 'POST',
        body: submitData,
      }),
    onSuccess: () => {
      toast.success('Thêm game thành công!');
      setFormData({
        name: '',
        slug: '',
        icon: '🎮',
        description: '',
        imageUrl: '',
        backgroundImage: '',
        rating: '',
        players: '',
        releaseDate: '',
        developer: '',
        publisher: '',
        platforms: [''],
        genre: [''],
      });
      queryClient.invalidateQueries({ queryKey: ['games', 'list'] });
      if (onSuccess) onSuccess();
      router.refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Vui lòng đăng nhập');
        if (onCancel) onCancel();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Thêm game thất bại';
      toast.error(msg);
    },
  });
  const loading = createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check admin role trước khi mutate. Logic này dạng "client-side hint",
    // BE vẫn enforce server-side khi nhận request.
    try {
      const raw = localStorage.getItem('authSession');
      if (!raw) {
        toast.error('Vui lòng đăng nhập');
        if (onCancel) onCancel();
        return;
      }
      const { user } = JSON.parse(raw);
      if (user?.role !== 'admin') {
        toast.error('Bạn không có quyền admin để thêm game');
        return;
      }
    } catch {
      toast.error('Vui lòng đăng nhập');
      return;
    }

    const submitData = {
      ...formData,
      rating: parseFloat(formData.rating) || 0,
      platforms: formData.platforms.filter((p) => p.trim()),
      genre: formData.genre.filter((g) => g.trim()),
    };
    createMutation.mutate(submitData);
  };

  const handleRemoveGameImage = async () => {
    if (formData.imageUrl) {
      await deleteImage(formData.imageUrl);
    }
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };
  
  const handleRemoveBackgroundImage = async () => {
    if (formData.backgroundImage) {
      await deleteImage(formData.backgroundImage);
    }
    setFormData(prev => ({ ...prev, backgroundImage: '' }));
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Hàng 1: Tên game và Slug */}
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Tên game <span className={styles.required}>*</span></label>
          <input type="text" name="name" value={formData.name} onChange={handleChange} onBlur={generateSlug} className={styles.input} required placeholder="VD: Genshin Impact" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Slug <span className={styles.required}>*</span></label>
          <input type="text" name="slug" value={formData.slug} onChange={handleChange} className={styles.input} required placeholder="VD: genshin-impact" />
        </div>
      </div>

      {/* Hàng 2: Icon và Rating */}
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Icon</label>
          <input type="text" name="icon" value={formData.icon} onChange={handleChange} className={styles.input} placeholder="🎮" maxLength={10} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Rating</label>
          <input type="number" step="0.1" name="rating" value={formData.rating} onChange={handleChange} className={styles.input} placeholder="0 - 5" min="0" max="5" />
        </div>
      </div>

      {/* Hàng 3: Số lượng người chơi và Ngày phát hành */}
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Số lượng người chơi</label>
          <input type="text" name="players" value={formData.players} onChange={handleChange} className={styles.input} placeholder="VD: 60M+" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Ngày phát hành</label>
          <input type="text" name="releaseDate" value={formData.releaseDate} onChange={handleChange} className={styles.input} placeholder="VD: September 28, 2020" />
        </div>
      </div>

      {/* Hàng 4: Nhà phát triển và Nhà phát hành */}
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Nhà phát triển</label>
          <input type="text" name="developer" value={formData.developer} onChange={handleChange} className={styles.input} placeholder="VD: HoYoverse" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Nhà phát hành</label>
          <input type="text" name="publisher" value={formData.publisher} onChange={handleChange} className={styles.input} placeholder="VD: HoYoverse" />
        </div>
      </div>

      {/* Upload ảnh game */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Ảnh game</label>
        <div className={styles.uploadArea}>
          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'image')} className={styles.fileInput} disabled={uploadingImage} />
          {uploadingImage && <span className={styles.uploadingText}>Đang upload...</span>}
          {formData.imageUrl && (
            <div className={styles.previewArea}>
              <img src={formData.imageUrl} alt="Preview" className={styles.previewImage} />
              <button type="button" onClick={handleRemoveGameImage} className={styles.removeImageBtn}>
                ✕ Xóa
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upload ảnh nền */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Ảnh nền</label>
        <div className={styles.uploadArea}>
          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'background')} className={styles.fileInput} disabled={uploadingBackground} />
          {uploadingBackground && <span className={styles.uploadingText}>Đang upload...</span>}
          {formData.backgroundImage && (
            <div className={styles.previewArea}>
              <img src={formData.backgroundImage} alt="Background Preview" className={styles.previewBackground} />
              <button type="button" onClick={handleRemoveBackgroundImage} className={styles.removeImageBtn}>✕ Xóa</button>
            </div>
          )}
        </div>
      </div>

      {/* Mô tả */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Mô tả</label>
        <textarea name="description" value={formData.description} onChange={handleChange} className={styles.textarea} rows={4} placeholder="Mô tả về game..." />
      </div>

      {/* Nền tảng */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Nền tảng</label>
        {formData.platforms.map((platform, idx) => (
          <div key={idx} className={styles.arrayItem}>
            <input type="text" value={platform} onChange={(e) => handleArrayChange('platforms', idx, e.target.value)} className={styles.arrayInput} placeholder="VD: PC, PS5, iOS..." />
            <button type="button" onClick={() => removeArrayItem('platforms', idx)} className={styles.removeArrayBtn}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => addArrayItem('platforms')} className={styles.addArrayBtn}>+ Thêm nền tảng</button>
      </div>

      {/* Thể loại */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Thể loại</label>
        {formData.genre.map((genre, idx) => (
          <div key={idx} className={styles.arrayItem}>
            <input type="text" value={genre} onChange={(e) => handleArrayChange('genre', idx, e.target.value)} className={styles.arrayInput} placeholder="VD: Action RPG, Open World..." />
            <button type="button" onClick={() => removeArrayItem('genre', idx)} className={styles.removeArrayBtn}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => addArrayItem('genre')} className={styles.addArrayBtn}>+ Thêm thể loại</button>
      </div>

      {/* Footer buttons */}
      <div className={styles.modalFooter}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Hủy</button>
        <button type="submit" disabled={loading} className={styles.submitBtn}>{loading ? 'Đang xử lý...' : 'Thêm game'}</button>
      </div>
    </form>
  );
}