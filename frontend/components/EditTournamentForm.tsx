// components/EditTournamentForm.tsx
"use client";

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import styles from './EditTournamentForm.module.css';
import FormatOrderSelector from '@/components/FormatOrderSelector';
import ContactList from '@/components/ContactList';
import GroupColumnsManager from '@/components/GroupColumnsManager';
import AdvancementStepsManager from '@/components/AdvancementStepsManager';
import BackButton from '@/components/BackButton';
import { useDeleteImage } from '@/hooks/useDeleteImage';
import TeamSizeSelector from './TeamSizeSelector';


const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const FORMAT_NAMES: Record<string, string> = {
  swiss: 'Vòng Swiss',
  group: 'Vòng bảng',
  single_elimination: 'Đấu loại trực tiếp',
  double_elimination: 'Nhánh thắng-thua',
};

interface TournamentData {
  id: number;
  gameId: number;
  name: string;
  formats: string[];
  startDate: string;
  endDate: string;
  maxParticipants: number;
  participantType: string;
  prize: number;
  description: string;
  imageUrl: string;
  contacts: Array<{ platform: string; contact: string }>;
  advancementSteps: number[] | null;
  groupColumns: any[] | null;
  teamMembers: number | null;
  teamSubstitutes: number | null;
}

interface EditTournamentFormProps {
  tournament: TournamentData;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function EditTournamentForm({ tournament, onSuccess, onCancel }: EditTournamentFormProps) {
  const router = useRouter();
  const { deleteImage } = useDeleteImage();
  const [formData, setFormData] = useState({
    name: tournament.name || '',
    startDate: tournament.startDate ? tournament.startDate.split('T')[0] : '',
    endDate: tournament.endDate ? tournament.endDate.split('T')[0] : '',
    maxParticipants: tournament.maxParticipants?.toString() || '',
    participantType: tournament.participantType || 'person',
    prize: tournament.prize?.toString() || '',
    description: tournament.description || '',
    imageUrl: tournament.imageUrl || '',
  });

  const [formatOrder, setFormatOrder] = useState<string[]>(tournament.formats || ['swiss']);
  const [advancementSteps, setAdvancementSteps] = useState<(number | null)[]>(tournament.advancementSteps || []);
  const [groupColumns, setGroupColumns] = useState<any[]>(tournament.groupColumns || []);
  const [contacts, setContacts] = useState<any[]>(tournament.contacts || []);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [teamSize, setTeamSize] = useState<{
    teamMembers: number | null;
    teamSubstitutes: number | null;
  }>({
    teamMembers: tournament.teamMembers || null,
    teamSubstitutes: tournament.teamSubstitutes || null,
  });

  // Reset form khi tournament thay đổi
  useEffect(() => {
    setFormData({
      name: tournament.name || '',
      startDate: tournament.startDate ? tournament.startDate.split('T')[0] : '',
      endDate: tournament.endDate ? tournament.endDate.split('T')[0] : '',
      maxParticipants: tournament.maxParticipants?.toString() || '',
      participantType: tournament.participantType || 'person',
      prize: tournament.prize?.toString() || '',
      description: tournament.description || '',
      imageUrl: tournament.imageUrl || '',
    });
    setFormatOrder(tournament.formats || ['swiss']);
    setAdvancementSteps(tournament.advancementSteps || []);
    setGroupColumns(tournament.groupColumns || []);
    setContacts(tournament.contacts || []);
    setTeamSize({
      teamMembers: tournament.teamMembers || null,
      teamSubstitutes: tournament.teamSubstitutes || null,
    });
  }, [tournament]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ảnh không được vượt quá 10MB');
      return;
    }
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Chỉ chấp nhận file JPEG, PNG, GIF, WEBP');
      return;
    }
    
    setUploading(true);
    
    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập');
        return;
      }
      
      const { token } = JSON.parse(session);
      const uploadForm = new FormData();
      uploadForm.append('image', file);
      
      const response = await fetch(`${API_BASE}/upload/tournament-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        toast.error(data.message || 'Upload thất bại');
        return;
      }
      
      setFormData(prev => ({ ...prev, imageUrl: data.imageUrl }));
      toast.success('Upload ảnh thành công!');
    } catch (error) {
      toast.error('Không thể upload ảnh');
    } finally {
      setUploading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) newErrors.name = 'Tên giải đấu là bắt buộc';
    if (!formatOrder.length) newErrors.formatOrder = 'Phải chọn ít nhất một thể thức';
    if (!formData.startDate) newErrors.startDate = 'Ngày diễn ra là bắt buộc';
    if (!formData.endDate) newErrors.endDate = 'Ngày kết thúc là bắt buộc';
    if (!formData.maxParticipants) newErrors.maxParticipants = 'Số lượng tham gia là bắt buộc';
    if (formData.maxParticipants && parseInt(formData.maxParticipants) <= 0) {
      newErrors.maxParticipants = 'Số lượng tham gia phải lớn hơn 0';
    }
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      newErrors.endDate = 'Ngày kết thúc phải sau ngày diễn ra';
    }
    
    if (formatOrder.length > 1) {
      const expectedSteps = formatOrder.length - 1;
      if (advancementSteps.length !== expectedSteps) {
        newErrors.advancementSteps = `Cần nhập đủ ${expectedSteps} giá trị cho số đội đi tiếp`;
      } else {
        for (let i = 0; i < advancementSteps.length; i++) {
          const stepVal = advancementSteps[i];
          if (stepVal == null || stepVal <= 0) {
            newErrors.advancementSteps = `Giá trị bước ${i + 1} phải lớn hơn 0`;
            break;
          }
        }
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTeamSizeChange = (data: { teamMembers: number | null; teamSubstitutes: number | null }) => {
    setTeamSize(data);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);

    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập');
        router.push('/login');
        return;
      }

      const { token } = JSON.parse(session);

      const submitData = {
        name: formData.name,
        formats: formatOrder,
        startDate: formData.startDate,
        endDate: formData.endDate,
        maxParticipants: parseInt(formData.maxParticipants),
        participantType: formData.participantType,
        prize: parseFloat(formData.prize) || 0,
        description: formData.description,
        imageUrl: formData.imageUrl,
        contacts: contacts.filter(c => c.contact && c.contact.trim() !== ''),
        advancementSteps:
          formatOrder.length > 1
            ? advancementSteps.map((v) => {
                if (v == null || v <= 0) {
                  throw new Error('advancementSteps should be validated before submit');
                }
                return v;
              })
            : null,
        groupColumns: formatOrder.includes('group') ? groupColumns : null,
        teamMembers: formData.participantType === 'team' ? teamSize.teamMembers : null,
        teamSubstitutes: formData.participantType === 'team' ? teamSize.teamSubstitutes : null,
      };

      const response = await fetch(`${API_BASE}/tournaments/${tournament.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || 'Cập nhật giải đấu thất bại');
        return;
      }

      toast.success('Cập nhật giải đấu thành công!');
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/tournaments/${tournament.id}`);
      }
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Không thể kết nối đến server');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (formData.imageUrl) {
      const deleted = await deleteImage(formData.imageUrl);
      if (deleted) {
        toast.success('Đã xóa ảnh');
      }
    }
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>Chỉnh sửa giải đấu</h1>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Tên giải đấu */}
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Tên giải đấu <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={styles.input}
              placeholder="Nhập tên giải đấu"
            />
            {errors.name && <span className={styles.errorText}>{errors.name}</span>}
          </div>

          {/* Thể thức */}
          <FormatOrderSelector
            value={formatOrder}
            onChange={setFormatOrder}
          />
          {errors.formatOrder && <span className={styles.errorText}>{errors.formatOrder}</span>}

          {/* Số đội đi tiếp */}
          {formatOrder.length > 1 && (
            <AdvancementStepsManager
              formatOrder={formatOrder}
              formatNames={FORMAT_NAMES}
              value={advancementSteps}
              onChange={setAdvancementSteps}
            />
          )}
          {errors.advancementSteps && <span className={styles.errorText}>{errors.advancementSteps}</span>}

          {/* Ngày tháng */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ngày diễn ra <span className={styles.required}>*</span></label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className={styles.input}
              />
              {errors.startDate && <span className={styles.errorText}>{errors.startDate}</span>}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ngày kết thúc <span className={styles.required}>*</span></label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className={styles.input}
              />
              {errors.endDate && <span className={styles.errorText}>{errors.endDate}</span>}
            </div>
          </div>

          {/* Loại tham gia & Số lượng */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Loại tham gia <span className={styles.required}>*</span></label>
              <select
                name="participantType"
                value={formData.participantType}
                onChange={handleChange}
                className={styles.input}
              >
                <option value="person">Số lượng người tham gia</option>
                <option value="team">Số lượng đội tham gia</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Số lượng {formData.participantType === 'person' ? 'người' : 'đội'} <span className={styles.required}>*</span>
              </label>
              <input
                type="number"
                name="maxParticipants"
                value={formData.maxParticipants}
                onChange={handleChange}
                className={styles.input}
                min="1"
              />
              {errors.maxParticipants && <span className={styles.errorText}>{errors.maxParticipants}</span>}
            </div>
          </div>

          <TeamSizeSelector
            participantType={formData.participantType as 'person' | 'team'}
            value={teamSize}
            onChange={handleTeamSizeChange}
          />
          {errors.teamMembers && <span className={styles.errorText}>{errors.teamMembers}</span>}
          {errors.teamSubstitutes && <span className={styles.errorText}>{errors.teamSubstitutes}</span>}

          {/* Tiền thưởng */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Tiền thưởng <span className={styles.required}>*</span></label>
            <input
              type="number"
              name="prize"
              value={formData.prize}
              onChange={handleChange}
              className={styles.input}
              min="0"
              step="100000"
            />
            {errors.prize && <span className={styles.errorText}>{errors.prize}</span>}
          </div>

          {/* Upload ảnh */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Hình ảnh giải đấu</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className={styles.fileInput}
              disabled={uploading}
            />
            {uploading && <p className={styles.uploadingText}>Đang upload ảnh...</p>}
            {formData.imageUrl && (
              <div className={styles.imagePreview}>
                <img src={formData.imageUrl} alt="Preview" className={styles.previewImage} />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className={styles.removeImageButton}
                >
                  ✕ Xóa
                </button>
              </div>
            )}
          </div>

          {/* Mô tả */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Thông tin giải đấu</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className={styles.textarea}
              rows={4}
            />
          </div>

          {/* Liên lạc */}
          <ContactList value={contacts} onChange={setContacts} />

          {/* Cấu hình vòng bảng */}
          {formatOrder.includes('group') && (
            <GroupColumnsManager
              value={groupColumns}
              onChange={setGroupColumns}
            />
          )}

          {/* Buttons */}
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelBtn}>
              Hủy
            </button>
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}