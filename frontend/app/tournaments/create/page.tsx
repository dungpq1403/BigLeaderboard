// app/tournaments/create/page.tsx
"use client";

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-toastify';
import styles from './page.module.css';
import FormatOrderSelector from '@/components/FormatOrderSelector';
import ContactList from '@/components/ContactList';
import GroupColumnsManager from '@/components/GroupColumnsManager';
import AdvancementStepsManager from '@/components/AdvancementStepsManager';
import BackButton from '@/components/button/BackButton';
import { useDeleteImage } from '@/hooks/useDeleteImage';
import TeamSizeSelector from '@/components/team/TeamSizeSelector';
import ThirdPlaceCheckbox from '@/components/ThirdPlaceCheckbox';
import RoundBestOfManager from '@/components/BO/RoundBestOfManager';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

// Map id -> tên hiển thị cho thể thức
const FORMAT_NAMES: Record<string, string> = {
  swiss: 'Vòng Swiss',
  group: 'Vòng bảng',
  single_elimination: 'Đấu loại trực tiếp',
  double_elimination: 'Nhánh thắng-thua',
};

export default function CreateTournamentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameId = searchParams.get('gameId');

  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    maxParticipants: '',
    participantType: 'person',
    prize: '',
    description: '',
    imageUrl: '',
  });

  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(false);
  const [formatOrder, setFormatOrder] = useState<string[]>(['swiss']);
  const [advancementSteps, setAdvancementSteps] = useState<(number | null)[]>([]); // mảng số lượng đi tiếp
  const [groupColumns, setGroupColumns] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { deleteImage } = useDeleteImage();
  const [teamSize, setTeamSize] = useState<{
    teamMembers: number | null;
    teamSubstitutes: number | null;
  }>({
    teamMembers: null,
    teamSubstitutes: null,
  });
  const newErrors: Record<string, string> = {};
  const [roundBestOfs, setRoundBestOfs] = useState<any[]>([]);
  

  // ==================== Handlers ====================
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

  // ==================== Validation ====================
  const validateForm = () => {
    if (!formData.name.trim()) newErrors.name = 'Tên giải đấu là bắt buộc';
    if (!formatOrder.length) newErrors.formatOrder = 'Phải chọn ít nhất một thể thức';
    if (!formData.startDate) newErrors.startDate = 'Ngày diễn ra là bắt buộc';
    if (!formData.endDate) newErrors.endDate = 'Ngày kết thúc là bắt buộc';
    if (!formData.maxParticipants) newErrors.maxParticipants = 'Số lượng tham gia là bắt buộc';
    if (formData.maxParticipants && parseInt(formData.maxParticipants) <= 0) {
      newErrors.maxParticipants = 'Số lượng tham gia phải lớn hơn 0';
    }
    if (formData.prize && parseFloat(formData.prize) < 0) {
      newErrors.prize = 'Tiền thưởng không được âm';
    }
    if (formData.startDate && formData.endDate && formData.startDate > formData.endDate) {
      newErrors.endDate = 'Ngày kết thúc phải sau ngày diễn ra';
    }
    
    // Kiểm tra advancement steps
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
  
  // Thêm validation
  if (formData.participantType === 'team') {
    if (!teamSize.teamMembers || teamSize.teamMembers < 1) {
      newErrors.teamMembers = 'Số thành viên trong đội phải lớn hơn 0';
    }
    if (teamSize.teamSubstitutes && teamSize.teamSubstitutes < 0) {
      newErrors.teamSubstitutes = 'Số dự bị không được âm';
    }
  }

  const handleThirdPlaceChange = (checked: boolean) => {
    setThirdPlaceMatch(checked);
  };

  const hasSingleElimination = formatOrder.includes('single_elimination');

  // ==================== Submit ====================
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (!gameId) {
      toast.error('Không tìm thấy game ID');
      return;
    }

    setLoading(true);

    try {
      const rawSession = localStorage.getItem('authSession');
      if (!rawSession) {
        toast.error('Vui lòng đăng nhập để tạo giải đấu');
        router.push('/login');
        return;
      }

      const session = JSON.parse(rawSession);
      const token = session.token;

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
        gameId: parseInt(gameId),
        contacts: contacts.filter(c => c.contact.trim() !== ''),
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
        thirdPlaceMatch: thirdPlaceMatch,
        roundBestOfs: roundBestOfs.length > 0 ? roundBestOfs : null,
      };

      console.log('Submitting:', submitData);

      const response = await fetch(`${API_BASE}/tournaments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(submitData),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || 'Tạo giải đấu thất bại');
        return;
      }

      toast.success('Tạo giải đấu thành công!');
      router.push(`/game/${gameId}`);
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('Không thể kết nối đến server');
    } finally {
      setLoading(false);
    }
  };

  // ==================== Render ====================
  if (!gameId) {
    return (
      <div className={styles.errorContainer}>
        <h1 className={styles.errorTitle}>Lỗi</h1>
        <p className={styles.errorMessage}>Không tìm thấy thông tin game.</p>
        <Link href="/" className={styles.backLink}>Quay về trang chủ</Link>
      </div>
    );
  }

  // Kiểm tra single_elimination có phải cuối cùng không
  const isSingleEliminationLast = formatOrder.length > 0 && 
    formatOrder[formatOrder.length - 1] === 'single_elimination';

  const handleRemoveImage = async () => {
    if (formData.imageUrl) {
      await deleteImage(formData.imageUrl);
    }
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <h1 className={styles.title}>Tạo giải đấu mới</h1>
        
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

          {/* Thể thức (có thứ tự) */}
          <FormatOrderSelector
            value={formatOrder}
            onChange={setFormatOrder}
          />
          {errors.formatOrder && <span className={styles.errorText}>{errors.formatOrder}</span>}

          {formatOrder.length > 0 && (
            <RoundBestOfManager
              formats={formatOrder}
              formatNames={FORMAT_NAMES}
              value={roundBestOfs}
              onChange={setRoundBestOfs}
            />
          )}

          {/* Số đội đi tiếp (dynamic steps) */}
          {formatOrder.length > 1 && (
            <AdvancementStepsManager
              formatOrder={formatOrder}
              formatNames={FORMAT_NAMES}
              value={advancementSteps}
              onChange={setAdvancementSteps}
            />
          )}
          {errors.advancementSteps && <span className={styles.errorText}>{errors.advancementSteps}</span>}

          {hasSingleElimination && (
            <ThirdPlaceCheckbox
            value={thirdPlaceMatch}
            onChange={handleThirdPlaceChange}
            disabled={!isSingleEliminationLast}
            reasonDisabled="Vòng loại trực tiếp phải là vòng cuối cùng của giải đấu để có trận tranh ba, tư."
            />
          )}

          {/* Ngày diễn ra / kết thúc */}
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Ngày diễn ra <span className={styles.required}>*</span>
              </label>
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
              <label className={styles.label}>
                Ngày kết thúc <span className={styles.required}>*</span>
              </label>
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
              <label className={styles.label}>
                Loại tham gia <span className={styles.required}>*</span>
              </label>
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
                Số lượng {formData.participantType === 'person' ? 'người' : 'đội'} tham gia <span className={styles.required}>*</span>
              </label>
              <input
                type="number"
                name="maxParticipants"
                value={formData.maxParticipants}
                onChange={handleChange}
                className={styles.input}
                placeholder={`Nhập số lượng ${formData.participantType === 'person' ? 'người' : 'đội'}`}
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
            <label className={styles.label}>
              Tiền thưởng <span className={styles.required}>*</span>
            </label>
            <input
              type="number"
              name="prize"
              value={formData.prize}
              onChange={handleChange}
              className={styles.input}
              placeholder="Nhập số tiền thưởng"
              min="0"
              step="100000"
            />
            {errors.prize && <span className={styles.errorText}>{errors.prize}</span>}
          </div>

          {/* Hình ảnh giải đấu */}
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
              placeholder="Nhập thông tin chi tiết về giải đấu"
              rows={4}
            />
          </div>

          {/* Liên lạc */}
          <ContactList value={contacts} onChange={setContacts} />

          {/* Cấu hình cột cho vòng bảng (chỉ hiện nếu có chọn 'group') */}
          {formatOrder.includes('group') && (
            <GroupColumnsManager
              value={groupColumns}
              onChange={setGroupColumns}
            />
          )}

          {/* Buttons */}
          <div className={styles.buttonGroup}>
            <BackButton defaultUrl="/" variant="primary" size="medium">
              Hủy
            </BackButton>
            <button type="submit" disabled={loading} className={styles.submitButton}>
              {loading ? 'Đang tạo...' : 'Tạo giải đấu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}