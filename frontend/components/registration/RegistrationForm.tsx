"use client";

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import styles from './RegistrationForm.module.css';
import TournamentStatus from '@/components/tournament/TournamentStatus';
import TournamentCreator from '@/components/tournament/TournamentCreator';
import TeamMemberForm from '@/components/team/TeamMemberForm';
import { useFormat } from '@/context/FormatContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface Tournament {
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
  createdBy: number;
  teamMembers?: number;
  teamSubstitutes?: number;
  creator?: {
    id: number;
    username: string;
    fullName: string;
  };
}

interface RegistrationFormProps {
  tournament: Tournament;
  userId: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface TeamMember {
  id: string;
  fullName: string;
  birthDate: string;
  email: string;
  phone: string;
  country: string;
}

export default function RegistrationForm({ tournament, userId, onSuccess, onCancel }: RegistrationFormProps) {
  const router = useRouter();
  const { getFormatName, getFormatIcon } = useFormat();
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  // Dữ liệu chung cho đội
  const [teamName, setTeamName] = useState('');
  
  // Dữ liệu cho cá nhân
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    birthDate: '',
    email: '',
    phone: '',
    country: '',
  });
  
  // Dữ liệu cho đội
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamSubstitutes, setTeamSubstitutes] = useState<TeamMember[]>([]);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [memberErrors, setMemberErrors] = useState<Record<string, Record<string, string>>>({});
  const [subErrors, setSubErrors] = useState<Record<string, Record<string, string>>>({});

  const isTeamTournament = tournament.participantType === 'team';
  const requiredMembers = tournament.teamMembers || 1;
  const maxSubstitutes = tournament.teamSubstitutes || 0;

  // Khởi tạo danh sách thành viên chính
  useEffect(() => {
    if (isTeamTournament && teamMembers.length === 0) {
      const initialMembers: TeamMember[] = [];
      for (let i = 0; i < requiredMembers; i++) {
        initialMembers.push({
          id: `member-${Date.now()}-${i}`,
          fullName: '',
          birthDate: '',
          email: '',
          phone: '',
          country: '',
        });
      }
      setTeamMembers(initialMembers);
    }
  }, [isTeamTournament, requiredMembers]);

  // Fetch user profile
  const fetchUserProfile = async () => {
    setLoadingProfile(true);
    try {
      const session = localStorage.getItem('authSession');
      if (!session) return;
      
      const { token } = JSON.parse(session);
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        if (!isTeamTournament) {
          setFormData({
            username: userData.username || '',
            fullName: userData.fullName || '',
            birthDate: userData.birthDate ? userData.birthDate.split('T')[0] : '',
            email: userData.email || '',
            phone: '',
            country: userData.country || '',
          });
          toast.success('Đã tự động điền thông tin từ profile!');
        } else {
          const updatedMembers = [...teamMembers];
          if (updatedMembers[0]) {
            updatedMembers[0] = {
              ...updatedMembers[0],
              fullName: userData.fullName || '',
              birthDate: userData.birthDate ? userData.birthDate.split('T')[0] : '',
              email: userData.email || '',
              country: userData.country || '',
            };
            setTeamMembers(updatedMembers);
          }
          toast.success('Đã tự động điền thông tin cho thành viên chính thứ nhất!');
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      toast.error('Không thể lấy thông tin profile');
    } finally {
      setLoadingProfile(false);
    }
  };

  // Handlers cho cá nhân
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  // Handlers cho đội
  const handleTeamNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTeamName(e.target.value);
    if (errors.teamName) setErrors(prev => ({ ...prev, teamName: '' }));
  };

  const handleMemberChange = (index: number, field: keyof TeamMember, value: string) => {
    const updated = [...teamMembers];
    updated[index] = { ...updated[index], [field]: value };
    setTeamMembers(updated);
    
    if (memberErrors[index]?.[field]) {
      const newMemberErrors = { ...memberErrors };
      if (newMemberErrors[index]) {
        delete newMemberErrors[index][field];
        if (Object.keys(newMemberErrors[index]).length === 0) delete newMemberErrors[index];
      }
      setMemberErrors(newMemberErrors);
    }
  };

  const handleSubstituteChange = (index: number, field: keyof TeamMember, value: string) => {
    const updated = [...teamSubstitutes];
    updated[index] = { ...updated[index], [field]: value };
    setTeamSubstitutes(updated);
    
    if (subErrors[index]?.[field]) {
      const newSubErrors = { ...subErrors };
      if (newSubErrors[index]) {
        delete newSubErrors[index][field];
        if (Object.keys(newSubErrors[index]).length === 0) delete newSubErrors[index];
      }
      setSubErrors(newSubErrors);
    }
  };

  const addSubstitute = () => {
    if (teamSubstitutes.length >= maxSubstitutes) {
      toast.warning(`Chỉ có thể thêm tối đa ${maxSubstitutes} dự bị`);
      return;
    }
    
    const newSubstitute: TeamMember = {
      id: `sub-${Date.now()}`,
      fullName: '',
      birthDate: '',
      email: '',
      phone: '',
      country: '',
    };
    setTeamSubstitutes([...teamSubstitutes, newSubstitute]);
  };

  const removeSubstitute = (index: number) => {
    setTeamSubstitutes(prev => prev.filter((_, i) => i !== index));
  };

  // Validation
  const validateIndividual = () => {
    const newErrors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{9,12}$/;
    
    if (!formData.username.trim()) newErrors.username = 'Username là bắt buộc';
    if (!formData.fullName.trim()) newErrors.fullName = 'Họ tên là bắt buộc';
    if (!formData.birthDate) newErrors.birthDate = 'Ngày sinh là bắt buộc';
    if (!formData.email.trim()) newErrors.email = 'Email là bắt buộc';
    else if (!emailRegex.test(formData.email)) newErrors.email = 'Email không hợp lệ';
    if (!formData.phone.trim()) newErrors.phone = 'Số điện thoại là bắt buộc';
    else if (!phoneRegex.test(formData.phone.replace(/[^0-9]/g, ''))) {
      newErrors.phone = 'Số điện thoại không hợp lệ (9-12 số)';
    }
    if (!formData.country) newErrors.country = 'Đất nước là bắt buộc';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateTeam = () => {
    const newErrors: Record<string, string> = {};
    const newMemberErrors: Record<string, Record<string, string>> = {};
    const newSubErrors: Record<string, Record<string, string>> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{9,12}$/;
    
    if (!teamName.trim()) newErrors.teamName = 'Tên đội là bắt buộc';
    
    // Validate thành viên chính
    for (let i = 0; i < teamMembers.length; i++) {
      const member = teamMembers[i];
      const fieldErrors: Record<string, string> = {};
      
      if (!member.fullName.trim()) fieldErrors.fullName = `Họ tên thành viên ${i + 1} là bắt buộc`;
      if (!member.birthDate) fieldErrors.birthDate = `Ngày sinh thành viên ${i + 1} là bắt buộc`;
      if (!member.email.trim()) fieldErrors.email = `Email thành viên ${i + 1} là bắt buộc`;
      else if (!emailRegex.test(member.email)) fieldErrors.email = `Email thành viên ${i + 1} không hợp lệ`;
      if (!member.phone.trim()) fieldErrors.phone = `Số điện thoại thành viên ${i + 1} là bắt buộc`;
      else if (!phoneRegex.test(member.phone.replace(/[^0-9]/g, ''))) {
        fieldErrors.phone = `Số điện thoại thành viên ${i + 1} không hợp lệ (9-12 số)`;
      }
      if (!member.country) fieldErrors.country = `Đất nước thành viên ${i + 1} là bắt buộc`;
      
      if (Object.keys(fieldErrors).length > 0) newMemberErrors[i] = fieldErrors;
    }
    
    // Validate dự bị
    for (let i = 0; i < teamSubstitutes.length; i++) {
      const sub = teamSubstitutes[i];
      const fieldErrors: Record<string, string> = {};
      
      if (sub.fullName && !sub.fullName.trim()) {
        fieldErrors.fullName = `Họ tên dự bị ${i + 1} là bắt buộc (nếu có)`;
      }
      if (sub.email && !emailRegex.test(sub.email)) {
        fieldErrors.email = `Email dự bị ${i + 1} không hợp lệ`;
      }
      if (sub.phone && !phoneRegex.test(sub.phone.replace(/[^0-9]/g, ''))) {
        fieldErrors.phone = `Số điện thoại dự bị ${i + 1} không hợp lệ (9-12 số)`;
      }
      
      if (Object.keys(fieldErrors).length > 0) newSubErrors[i] = fieldErrors;
    }
    
    setErrors(newErrors);
    setMemberErrors(newMemberErrors);
    setSubErrors(newSubErrors);
    
    return Object.keys(newErrors).length === 0 && 
           Object.keys(newMemberErrors).length === 0 && 
           Object.keys(newSubErrors).length === 0;
  };

  // Submit
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const isValid = isTeamTournament ? validateTeam() : validateIndividual();
    if (!isValid) return;
    
    setLoading(true);
    
    try {
      const session = localStorage.getItem('authSession');
      if (!session) {
        toast.error('Vui lòng đăng nhập để đăng ký');
        router.push('/login');
        return;
      }
      
      const { token } = JSON.parse(session);
      
      let requestBody;
      
      if (isTeamTournament) {
        requestBody = {
          tournamentId: tournament.id,
          userId,
          teamName: teamName.trim(),
          participantType: 'team',
          members: teamMembers.map(({ fullName, birthDate, email, phone, country }) => ({
            fullName, birthDate, email, phone, country
          })),
          substitutes: teamSubstitutes.map(({ fullName, birthDate, email, phone, country }) => ({
            fullName, birthDate, email, phone, country
          })),
        };
      } else {
        requestBody = {
          tournamentId: tournament.id,
          userId,
          username: formData.username,
          fullName: formData.fullName,
          birthDate: formData.birthDate,
          email: formData.email,
          phone: formData.phone,
          country: formData.country,
          participantType: 'person',
        };
      }
      
      const response = await fetch(`${API_BASE}/tournaments/${tournament.id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(requestBody),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        toast.error(data.message || 'Đăng ký thất bại');
        return;
      }
      
      toast.success('Đăng ký thành công!');
      if (onSuccess) onSuccess();
      else router.push(`/tournaments/${tournament.id}`);
    } catch (error) {
      toast.error('Không thể kết nối đến server');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  // Render form cá nhân
  const renderIndividualForm = () => (
    <>
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Username <span className={styles.required}>*</span></label>
          <input type="text" name="username" value={formData.username} onChange={handleChange} className={styles.input} />
          {errors.username && <span className={styles.errorText}>{errors.username}</span>}
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Họ và tên <span className={styles.required}>*</span></label>
          <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} className={styles.input} />
          {errors.fullName && <span className={styles.errorText}>{errors.fullName}</span>}
        </div>
      </div>
      
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Ngày sinh <span className={styles.required}>*</span></label>
          <input type="date" name="birthDate" value={formData.birthDate} onChange={handleChange} className={styles.input} />
          {errors.birthDate && <span className={styles.errorText}>{errors.birthDate}</span>}
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Email <span className={styles.required}>*</span></label>
          <input type="email" name="email" value={formData.email} onChange={handleChange} className={styles.input} />
          {errors.email && <span className={styles.errorText}>{errors.email}</span>}
        </div>
      </div>
      
      <div className={styles.formRow}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Số điện thoại <span className={styles.required}>*</span></label>
          <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className={styles.input} />
          {errors.phone && <span className={styles.errorText}>{errors.phone}</span>}
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Đất nước <span className={styles.required}>*</span></label>
          <select name="country" value={formData.country} onChange={handleChange} className={styles.select}>
            <option value="">Chọn đất nước</option>
            <option value="Vietnam">🇻🇳 Việt Nam</option>
            <option value="USA">🇺🇸 Hoa Kỳ</option>
            <option value="UK">🇬🇧 Vương quốc Anh</option>
            <option value="Japan">🇯🇵 Nhật Bản</option>
            <option value="Korea">🇰🇷 Hàn Quốc</option>
            <option value="China">🇨🇳 Trung Quốc</option>
            <option value="France">🇫🇷 Pháp</option>
            <option value="Germany">🇩🇪 Đức</option>
            <option value="Australia">🇦🇺 Úc</option>
            <option value="Canada">🇨🇦 Canada</option>
          </select>
          {errors.country && <span className={styles.errorText}>{errors.country}</span>}
        </div>
      </div>
    </>
  );

  // Render form đội
  const renderTeamForm = () => (
    <>
      <div className={styles.formGroup}>
        <label className={styles.label}>Tên đội <span className={styles.required}>*</span></label>
        <input type="text" value={teamName} onChange={handleTeamNameChange} className={styles.input} placeholder="Nhập tên đội" />
        {errors.teamName && <span className={styles.errorText}>{errors.teamName}</span>}
      </div>

      {/* Thành viên chính */}
      <div className={styles.teamSection}>
        <h3 className={styles.sectionSubtitle}>
          👥 Thành viên chính <span className={styles.required}>({requiredMembers} thành viên bắt buộc)</span>
        </h3>
        <p className={styles.sectionHint}>Đội phải có đúng {requiredMembers} thành viên chính</p>
        
        {teamMembers.map((member, idx) => (
          <TeamMemberForm
            key={member.id}
            member={member}
            index={idx}
            type="member"
            errors={memberErrors[idx]}
            onChange={handleMemberChange}
          />
        ))}
      </div>

      {/* Dự bị */}
      {maxSubstitutes > 0 && (
        <div className={styles.teamSection}>
          <div className={styles.substitutesHeader}>
            <h3 className={styles.sectionSubtitle}>
              🔄 Dự bị <span className={styles.optional}>(tối đa {maxSubstitutes} người)</span>
            </h3>
            {teamSubstitutes.length < maxSubstitutes && (
              <button type="button" onClick={addSubstitute} className={styles.addSubstituteBtn}>
                + Thêm dự bị
              </button>
            )}
          </div>
          <p className={styles.sectionHint}>Có thể đăng ký ít hơn hoặc bằng {maxSubstitutes} dự bị</p>
          
          {teamSubstitutes.map((sub, idx) => (
            <TeamMemberForm
              key={sub.id}
              member={sub}
              index={idx}
              type="substitute"
              errors={subErrors[idx]}
              onChange={handleSubstituteChange}
              onRemove={removeSubstitute}
              showRemove={true}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            {isTeamTournament ? 'Đăng ký đội tham gia giải đấu' : 'Đăng ký tham gia giải đấu'}
          </h1>
          <button type="button" onClick={fetchUserProfile} className={styles.autoFillButton} disabled={loadingProfile}>
            {loadingProfile ? 'Đang tải...' : '📝 Tự động điền thông tin'}
          </button>
        </div>
        
        {/* Tournament Info */}
        <div className={styles.tournamentInfo}>
          <div className={styles.tournamentHeader}>
            {tournament.imageUrl && (
              <img src={tournament.imageUrl} alt={tournament.name} className={styles.tournamentImage} />
            )}
            <div className={styles.tournamentDetails}>
              <h2 className={styles.tournamentName}>{tournament.name}</h2>
              <div className={styles.tournamentMeta}>
                <TournamentCreator userId={tournament.createdBy} username={tournament.creator?.username || 'Unknown'} variant="badge" />
                <TournamentStatus startDate={tournament.startDate} endDate={tournament.endDate} variant="badge" />
              </div>
              <div className={styles.tournamentFormats}>
                {tournament.formats?.map((format, idx) => (
                  <span key={idx} className={styles.formatBadge}>
                    {getFormatIcon(format)} {getFormatName(format)}
                  </span>
                ))}
              </div>
              <div className={styles.tournamentStats}>
                <span>📅 {new Date(tournament.startDate).toLocaleDateString('vi-VN')} - {new Date(tournament.endDate).toLocaleDateString('vi-VN')}</span>
                <span>👥 {tournament.maxParticipants} {tournament.participantType === 'person' ? 'người' : 'đội'}</span>
                <span>🏆 {formatCurrency(tournament.prize)}</span>
              </div>
              {isTeamTournament && tournament.teamMembers && (
                <div className={styles.teamInfoBadge}>
                  👥 Mỗi đội gồm {tournament.teamMembers} thành viên chính
                  {tournament.teamSubstitutes ? ` + tối đa ${tournament.teamSubstitutes} dự bị` : ''}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Registration Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          {isTeamTournament ? renderTeamForm() : renderIndividualForm()}
          
          <div className={styles.buttonGroup}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>Hủy</button>
            <button type="submit" disabled={loading} className={styles.submitButton}>
              {loading ? 'Đang xử lý...' : (isTeamTournament ? 'Xác nhận đăng ký đội' : 'Xác nhận đăng ký')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}