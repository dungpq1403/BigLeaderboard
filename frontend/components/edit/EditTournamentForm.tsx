// components/EditTournamentForm.tsx
"use client";

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import styles from './EditTournamentForm.module.css';
import FormatOrderSelector, { SWISS_MIN_PARTICIPANTS } from '@/components/FormatOrderSelector';
import ContactList from '@/components/ContactList';
import GroupColumnsManager from '@/components/GroupColumnsManager';
import AdvancementStepsManager from '@/components/AdvancementStepsManager';
import { useDeleteImage } from '@/hooks/useDeleteImage';
import TeamSizeSelector from '@/components/team/TeamSizeSelector';
import RoundBestOfManager from '@/components/BO/RoundBestOfManager';
import ThirdPlaceCheckbox from '@/components/ThirdPlaceCheckbox';
import { apiFetch, ApiError } from '@/lib/api';

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
  roundBestOfs: Array<{ formatType: string; bestOf: number }>;
  thirdPlaceMatch?: boolean; 
}

interface EditTournamentFormProps {
  tournament: TournamentData;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function EditTournamentForm({ tournament, onSuccess, onCancel }: EditTournamentFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(tournament.thirdPlaceMatch || false);
  const [formatOrder, setFormatOrder] = useState<string[]>(tournament.formats || ['swiss']);
  const [advancementSteps, setAdvancementSteps] = useState<(number | null)[]>(tournament.advancementSteps || []);
  const [groupColumns, setGroupColumns] = useState<any[]>(tournament.groupColumns || []);
  const [contacts, setContacts] = useState<any[]>(tournament.contacts || []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [teamSize, setTeamSize] = useState<{
    teamMembers: number | null;
    teamSubstitutes: number | null;
  }>({
    teamMembers: tournament.teamMembers || null,
    teamSubstitutes: tournament.teamSubstitutes || null,
  });
  const [roundBestOfs, setRoundBestOfs] = useState<any[]>(tournament.roundBestOfs || []);

  useEffect(() => {
    setThirdPlaceMatch(tournament.thirdPlaceMatch || false);
  }, [tournament]);

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
    setThirdPlaceMatch(tournament.thirdPlaceMatch || false);
    setRoundBestOfs(tournament.roundBestOfs || []);
  }, [tournament]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('image', file);
      return apiFetch<{ imageUrl: string }>(`/upload/tournament-image`, {
        method: 'POST',
        body: fd,
      });
    },
    onSuccess: (data) => {
      setFormData((prev) => ({ ...prev, imageUrl: data.imageUrl }));
      toast.success('Upload ảnh thành công!');
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
  const uploading = uploadMutation.isPending;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    uploadMutation.mutate(file);
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
    // Swiss yêu cầu số đội/người ≥ SWISS_MIN_PARTICIPANTS (đồng bộ với create page
    // và backend). FormatOrderSelector đã tự loại Swiss khi giảm số đội, đây là
    // lớp validate cuối cùng trước khi submit.
    if (
      formatOrder.includes('swiss') &&
      formData.maxParticipants &&
      parseInt(formData.maxParticipants) < SWISS_MIN_PARTICIPANTS
    ) {
      newErrors.maxParticipants = `Vòng Swiss yêu cầu số lượng tham gia tối thiểu ${SWISS_MIN_PARTICIPANTS}`;
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

  const handleThirdPlaceChange = (checked: boolean) => {
    setThirdPlaceMatch(checked);
  };

  const hasSingleElimination = formatOrder.includes('single_elimination');

  const updateMutation = useMutation({
    mutationFn: (submitData: Record<string, unknown>) =>
      apiFetch<{ message?: string }>(`/tournaments/${tournament.id}`, {
        method: 'PUT',
        body: submitData,
      }),
    onSuccess: () => {
      toast.success('Cập nhật giải đấu thành công!');
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournament.id] });
      queryClient.invalidateQueries({
        queryKey: ['games', tournament.gameId, 'tournaments'],
      });
      if (onSuccess) onSuccess();
      else router.push(`/tournaments/${tournament.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Vui lòng đăng nhập');
        router.push('/login');
        return;
      }
      const msg = err instanceof Error ? err.message : 'Cập nhật giải đấu thất bại';
      toast.error(msg);
    },
  });
  const loading = updateMutation.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;

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
      contacts: contacts.filter((c) => c.contact && c.contact.trim() !== ''),
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
      roundBestOfs: roundBestOfs.filter((r) => r.bestOf),
      thirdPlaceMatch: hasSingleElimination ? thirdPlaceMatch : false,
    };

    updateMutation.mutate(submitData);
  };

  const isSingleEliminationLast = formatOrder.length > 0 && 
    formatOrder[formatOrder.length - 1] === 'single_elimination';

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
            maxParticipants={
              formData.maxParticipants ? parseInt(formData.maxParticipants) : null
            }
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

          {/* BO đấu cho từng vòng */}
          {formatOrder.length > 0 && (
            <RoundBestOfManager formats={formatOrder} formatNames={FORMAT_NAMES} value={roundBestOfs} onChange={setRoundBestOfs} />
          )}

          {hasSingleElimination && (
            <ThirdPlaceCheckbox
              value={thirdPlaceMatch}
              onChange={handleThirdPlaceChange}
              disabled={!isSingleEliminationLast}
              reasonDisabled="Vòng loại trực tiếp phải là vòng cuối cùng của giải đấu để có trận tranh ba, tư."
            />
          )}

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