"use client";

import { useState, FormEvent, useEffect } from 'react';
import { toast } from 'react-toastify';
import styles from './EditProfileModal.module.css';
import TeamSizeSelector from '@/components/TeamSizeSelector';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: {
    id: number;
    username: string;
    fullName: string;
    email: string;
    birthDate: string;
    description: string;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export default function EditProfileModal({ isOpen, onClose, onSuccess, user }: EditProfileModalProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    birthDate: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  

  useEffect(() => {
    if (isOpen && user) {
      setFormData({
        fullName: user.fullName || '',
        email: user.email || '',
        birthDate: user.birthDate ? user.birthDate.split('T')[0] : '',
        description: user.description || '',
      });
    }
  }, [isOpen, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Họ tên không được để trống';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email không hợp lệ';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập lại');
        onClose();
        return;
      }
      
      const { token } = JSON.parse(session);
      
      const response = await fetch(`${API_BASE}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        toast.error(data.message || 'Cập nhật thất bại');
        return;
      }
      
      toast.success('Cập nhật thông tin thành công!');
      
      // Gọi onSuccess để cập nhật UI, không reload
      onSuccess();
      
      // Đóng modal
      onClose();
      
    } catch (error) {
      toast.error('Không thể kết nối đến server');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Chỉnh sửa thông tin</h2>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Username <span className={styles.disabled}> (không thể thay đổi)</span>
            </label>
            <input
              type="text"
              value={user.username}
              disabled
              className={`${styles.input} ${styles.disabledInput}`}
            />
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Họ và tên <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className={styles.input}
              placeholder="Nhập họ và tên"
            />
            {errors.fullName && <span className={styles.errorText}>{errors.fullName}</span>}
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={styles.input}
              placeholder="example@email.com"
            />
            {errors.email && <span className={styles.errorText}>{errors.email}</span>}
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>Ngày sinh</label>
            <input
              type="date"
              name="birthDate"
              value={formData.birthDate}
              onChange={handleChange}
              className={styles.input}
            />
          </div>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>Mô tả</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className={styles.textarea}
              placeholder="Giới thiệu về bản thân..."
              rows={4}
            />
          </div>
          
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Hủy
            </button>
            <button type="submit" disabled={loading} className={styles.submitButton}>
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}