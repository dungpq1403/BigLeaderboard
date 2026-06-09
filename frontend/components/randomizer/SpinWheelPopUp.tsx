import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './SpinWheelPopUp.module.css';

interface Participant {
  id: string;
  name: string;
}

interface SpinWheelPopUpProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
  // Trả về danh sách team đã RESOLVE theo thứ tự ô slot trên bracket:
  // [slot0, slot1, slot2, slot3, ...] với (slot0,slot1) = cặp 1, (slot2,slot3)
  // = cặp 2… Dùng object {id, name} (không chỉ ID) để bracket có thể hiển thị
  // đúng cả khi pool chứa placeholder cho vòng sau (vd: "Đội đi tiếp #1") —
  // những team đó không tồn tại trong bracketData.participants nên lookup theo
  // ID sẽ fail.
  onConfirmPairs: (orderedTeams: Participant[]) => void;
}

// Số vòng quay tối thiểu mỗi lần spin (đảm bảo animation đủ "đã mắt").
const MIN_TURNS = 6;
// Thời gian animation (đồng bộ với CSS transition duration của .wheel).
const SPIN_DURATION_MS = 4200;

// Tính rotation mới (luôn lớn hơn current) sao cho segment chỉ định nằm chính
// xác dưới mũi tên ở đỉnh wheel. Wheel xoay theo chiều kim đồng hồ; segment 0
// được đặt bắt đầu từ đỉnh và đi cw.
function rotateToSegment(
  currentRotation: number,
  segmentIndex: number,
  totalSegments: number,
): number {
  const segmentAngle = 360 / totalSegments;
  // Để segment i ở đỉnh: (i + 0.5) * segmentAngle + R ≡ 0 (mod 360)
  // → R mod 360 = 360 - (i + 0.5) * segmentAngle
  const targetMod =
    ((360 - (segmentIndex + 0.5) * segmentAngle) % 360 + 360) % 360;
  const baseRotation = currentRotation + MIN_TURNS * 360;
  const baseMod = ((baseRotation % 360) + 360) % 360;
  let delta = targetMod - baseMod;
  if (delta < 0) delta += 360;
  return baseRotation + delta;
}

// Sinh color theo HSL spread đều quanh bánh xe — giữ độ bão hoà / sáng cố định
// để các segment nhìn nhất quán, dễ phân biệt mà vẫn ăn nhập với palette amber.
function segmentColor(i: number, total: number): string {
  const hue = Math.round((i * 360) / Math.max(total, 1));
  return `hsl(${hue}, 65%, 42%)`;
}

// Đường path SVG cho 1 lát bánh (pie slice) từ tâm (cx,cy) bán kính r, chiếm
// góc [startDeg, endDeg] tính theo chiều kim đồng hồ từ đỉnh wheel.
function describePie(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const toXY = (deg: number) => {
    // 0° = đỉnh (12 giờ), cộng cw → SVG dùng x = cx + r*sin, y = cy - r*cos
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  };
  const start = toXY(startDeg);
  const end = toXY(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

// Cắt ngắn tên cho vừa lát bánh — slot có ít chỗ khi nhiều participant.
function truncateName(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, Math.max(1, max - 1)) + '…';
}

export default function SpinWheelPopUp({
  isOpen,
  onClose,
  participants = [],
  onConfirmPairs,
}: SpinWheelPopUpProps) {
  // remaining: các participant còn lại trên wheel (sẽ thu nhỏ dần sau mỗi spin).
  const [remaining, setRemaining] = useState<Participant[]>([]);
  // currentPair: 0 hoặc 1 phần tử — phần tử đầu của cặp đang được hình thành.
  const [currentPair, setCurrentPair] = useState<Participant[]>([]);
  // pairs: danh sách cặp đã hoàn tất.
  const [pairs, setPairs] = useState<Participant[][]>([]);
  // BYE (lẻ): khi participant cuối cùng không có đối thủ, tự động vào ô này.
  const [bye, setBye] = useState<Participant | null>(null);
  // rotation: góc xoay cộng dồn của wheel (dương = cw).
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  // pendingPick: participant đã chọn cho lần spin hiện tại — chỉ commit vào
  // state sau khi animation kết thúc (onTransitionEnd hoặc fallback timeout).
  const pendingPickRef = useRef<Participant | null>(null);
  // Timeout fallback phòng trường hợp transitionend không fire (vd: tab bị
  // background hoặc transition bị huỷ giữa chừng do re-render).
  const fallbackTimerRef = useRef<number | null>(null);
  // Mirror state sang refs để commitSpinResult đọc giá trị mới nhất mà không
  // phải dùng updater function dạng setState(prev => ...). LÝ DO: React
  // strict mode (mặc định bật trong Next.js dev) double-invokes updater
  // functions để test purity. Nếu updater có SIDE EFFECT (gọi setState khác
  // lồng bên trong), side effect sẽ chạy 2 lần → ở lần 2, state "trước" đã
  // là kết quả của lần 1, gây ra duplicate pair bug (mỗi spin tạo cặp
  // [picked, picked] thay vì cặp đúng). Với refs ta đọc/ghi đồng bộ và chỉ
  // dùng setState với giá trị TRỰC TIẾP (không qua updater).
  const remainingRef = useRef<Participant[]>([]);
  const currentPairRef = useRef<Participant[]>([]);
  const pairsRef = useRef<Participant[][]>([]);

  // Reset toàn bộ state khi popup mở (hoặc khi participants đổi giữa các lần mở).
  useEffect(() => {
    if (!isOpen) return;
    setRemaining(participants);
    setCurrentPair([]);
    setPairs([]);
    setBye(null);
    setRotation(0);
    setSpinning(false);
    pendingPickRef.current = null;
    // Sync ngay refs để commitSpinResult đọc đúng giá trị mới nhất, không
    // phải chờ useEffect mirror chạy sau render.
    remainingRef.current = participants;
    currentPairRef.current = [];
    pairsRef.current = [];
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, [isOpen, participants]);

  // ESC để đóng — đồng bộ với các popup khác trong bộ randomizer.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Cleanup timeout khi unmount.
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const totalRemaining = remaining.length;
  const allDone = totalRemaining === 0;
  const nothingToSpin = participants.length < 2;

  // Logic commit kết quả sau khi quay xong — tách hàm để vừa gọi từ
  // onTransitionEnd vừa từ fallback timer.
  //
  // QUAN TRỌNG: KHÔNG được lồng setState updater (vd: setCurrentPair(cb)
  // bên trong setRemaining(cb)) vì React strict mode double-invokes updater
  // functions. Khi updater có side effect (gọi setState khác), side effect
  // chạy 2 lần → lần 2 setCurrentPair sẽ thấy state là kết quả của lần 1,
  // dẫn tới việc tự ghép cặp [picked, picked] và pairs bị duplicate. Thay
  // vào đó, đọc state mới nhất từ refs và set giá trị trực tiếp.
  const commitSpinResult = () => {
    if (!pendingPickRef.current) return;
    const picked = pendingPickRef.current;
    pendingPickRef.current = null;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    const prevRemaining = remainingRef.current;
    const prevCurrentPair = currentPairRef.current;
    const prevPairs = pairsRef.current;

    const nextRemaining = prevRemaining.filter((p) => p.id !== picked.id);

    let nextCurrentPair = prevCurrentPair;
    let nextPairs = prevPairs;
    let nextBye: Participant | null = null;

    if (prevCurrentPair.length === 0) {
      // Đây là đội đầu của cặp. Nếu hết participants ngay sau pick → BYE.
      if (nextRemaining.length === 0) {
        nextBye = picked;
      } else {
        nextCurrentPair = [picked];
      }
    } else {
      // currentPair có 1 → ghép thành cặp hoàn chỉnh.
      nextCurrentPair = [];
      nextPairs = [...prevPairs, [prevCurrentPair[0], picked]];
    }

    // Cập nhật refs ngay để các call tiếp theo (vd: spin liền) thấy state mới.
    remainingRef.current = nextRemaining;
    currentPairRef.current = nextCurrentPair;
    pairsRef.current = nextPairs;

    setRemaining(nextRemaining);
    if (nextCurrentPair !== prevCurrentPair) setCurrentPair(nextCurrentPair);
    if (nextPairs !== prevPairs) setPairs(nextPairs);
    if (nextBye) setBye(nextBye);
    setSpinning(false);
  };

  const handleSpin = () => {
    if (spinning || remaining.length === 0) return;
    const idx = Math.floor(Math.random() * remaining.length);
    const picked = remaining[idx];
    const target = rotateToSegment(rotation, idx, remaining.length);
    pendingPickRef.current = picked;
    setRotation(target);
    setSpinning(true);

    // Fallback: nếu vì lý do gì đó transitionend không fire (tab ẩn, transition
    // bị huỷ do re-mount…), vẫn commit kết quả sau SPIN_DURATION + buffer.
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
    }
    fallbackTimerRef.current = window.setTimeout(
      commitSpinResult,
      SPIN_DURATION_MS + 200,
    );
  };

  const handleWheelTransitionEnd = (e: React.TransitionEvent) => {
    // Chỉ phản ứng với transition của transform (tránh fire nhầm với các
    // transition khác như filter/box-shadow nếu thêm sau này).
    if (e.propertyName && e.propertyName !== 'transform') return;
    commitSpinResult();
  };

  // Reset state để spin lại từ đầu — hữu ích khi user muốn random lại mà
  // không phải đóng/mở modal.
  const handleReset = () => {
    setRemaining(participants);
    setCurrentPair([]);
    setPairs([]);
    setBye(null);
    setRotation(0);
    setSpinning(false);
    pendingPickRef.current = null;
    remainingRef.current = participants;
    currentPairRef.current = [];
    pairsRef.current = [];
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const handleConfirm = () => {
    // Convert pairs → flat seeding theo thứ tự ô slot bracket.
    const flatTeams: Participant[] = [];
    pairs.forEach(([a, b]) => {
      flatTeams.push(a, b);
    });
    // Nếu còn currentPair (cặp dang dở) → đẩy vào trước BYE.
    currentPair.forEach((p) => flatTeams.push(p));
    if (bye) flatTeams.push(bye);
    onConfirmPairs(flatTeams);
    onClose();
  };

  // Vẽ các lát bánh + label. useMemo tránh tính lại khi spin (vì spin chỉ đổi
  // rotation, không đổi remaining cho tới lúc commit).
  const wheelSize = 320;
  const cx = wheelSize / 2;
  const cy = wheelSize / 2;
  const radius = wheelSize / 2 - 6; // chừa chỗ cho stroke ngoài
  // labelRadius đặt text ngay giữa "chiều dài" của lát bánh để text trải đều
  // theo cả 2 hướng dọc bán kính (vào tâm + ra rim).
  const labelRadius = radius * 0.55;

  const slices = useMemo(() => {
    const n = remaining.length;
    if (n === 0) return [];
    const segmentAngle = 360 / n;
    // Text nằm DỌC theo bán kính → tổng độ dài hữu dụng ≈ radius. Tính maxChars
    // theo fontSize trung bình (~6.5px/char ở size 12) để không tràn ra ngoài.
    const charPx = n > 12 ? 5.5 : 6.5;
    const maxChars = Math.max(6, Math.floor((radius * 0.95) / charPx));
    return remaining.map((p, i) => {
      const startDeg = i * segmentAngle;
      const endDeg = (i + 1) * segmentAngle;
      const centerDeg = startDeg + segmentAngle / 2;
      const path = describePie(cx, cy, radius, startDeg, endDeg);

      // Toạ độ điểm đặt text: trung điểm bán kính của lát, theo direction
      // centerDeg (từ đỉnh, cw). Text-anchor="middle" → trải đều 2 phía.
      const labelRad = (centerDeg * Math.PI) / 180;
      const tx = cx + labelRadius * Math.sin(labelRad);
      const ty = cy - labelRadius * Math.cos(labelRad);

      // Text DỌC theo lát bánh (theo hướng bán kính): xoay text sao cho trục
      // x của text trùng với hướng radial (từ tâm ra rim).
      //  - SVG rotation: 0° → x phải; cw dương. Trục x hướng top = -90°.
      //  - Radial direction tại centerDeg (cw từ top) ⇄ SVG angle (centerDeg - 90).
      // Lật 180° cho các lát ở nửa dưới (90° < centerDeg < 270°) để chữ
      // không bị ngược đầu — vẫn dọc theo lát nhưng đọc dễ hơn.
      let textRotation = centerDeg - 90;
      if (centerDeg > 90 && centerDeg < 270) {
        textRotation += 180;
      }

      return {
        id: p.id,
        path,
        color: segmentColor(i, n),
        label: truncateName(p.name, maxChars),
        tx,
        ty,
        textRotation,
      };
    });
  }, [remaining, cx, cy, radius, labelRadius]);

  if (!isOpen) return null;

  // ----- Render -----
  const totalParticipants = participants.length;
  const expectedPairs = Math.floor(totalParticipants / 2);
  const hasOddParticipant = totalParticipants % 2 === 1;

  let statusText = '';
  if (nothingToSpin) {
    statusText = 'Cần ít nhất 2 đội để quay';
  } else if (allDone) {
    statusText = 'Đã quay xong tất cả các cặp';
  } else if (currentPair.length === 0) {
    statusText = `Đang chọn đội 1 cho cặp ${pairs.length + 1}`;
  } else {
    statusText = `Đang chọn đối thủ cho "${currentPair[0].name}"`;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h1 className={styles.title}>Vòng quay chọn cặp đấu</h1>
          <div className={styles.progress}>
            {pairs.length}/{expectedPairs} cặp
            {hasOddParticipant ? ' (+1 BYE)' : ''}
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.wheelArea}>
            <div className={styles.wheelWrapper}>
              <div className={styles.pointer} aria-hidden="true" />
              <svg
                className={styles.wheel}
                width={wheelSize}
                height={wheelSize}
                viewBox={`0 0 ${wheelSize} ${wheelSize}`}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transitionDuration: spinning ? `${SPIN_DURATION_MS}ms` : '0ms',
                }}
                onTransitionEnd={handleWheelTransitionEnd}
              >
                {slices.length === 0 ? (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="rgba(0,0,0,0.35)"
                    stroke="rgba(245,158,11,0.5)"
                    strokeWidth={2}
                  />
                ) : (
                  slices.map((s) => (
                    <g key={s.id}>
                      <path
                        d={s.path}
                        fill={s.color}
                        stroke="rgba(0,0,0,0.35)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={s.tx}
                        y={s.ty}
                        transform={`rotate(${s.textRotation} ${s.tx} ${s.ty})`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#fffbeb"
                        fontSize={remaining.length > 12 ? 11 : 13}
                        fontWeight={700}
                        pointerEvents="none"
                        style={{
                          // Đổ bóng nhẹ giúp chữ nổi trên các lát màu sáng tối khác nhau.
                          paintOrder: 'stroke',
                          stroke: 'rgba(0,0,0,0.55)',
                          strokeWidth: 2,
                          strokeLinecap: 'round',
                          strokeLinejoin: 'round',
                        }}
                      >
                        {s.label}
                      </text>
                    </g>
                  ))
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={18}
                  fill="#fde68a"
                  stroke="#7c2d12"
                  strokeWidth={3}
                />
              </svg>
            </div>

            <div className={styles.statusRow}>
              <span className={styles.statusText}>{statusText}</span>
              {currentPair.length === 1 && (
                <span className={styles.currentPick}>
                  Đã chọn: <strong>{currentPair[0].name}</strong>
                </span>
              )}
            </div>

            <div className={styles.spinControls}>
              <button
                type="button"
                className={styles.spinButton}
                onClick={handleSpin}
                disabled={spinning || allDone || nothingToSpin}
              >
                {spinning ? 'Đang quay...' : allDone ? 'Đã xong' : 'Quay'}
              </button>
              <button
                type="button"
                className={styles.resetButton}
                onClick={handleReset}
                disabled={spinning || (pairs.length === 0 && currentPair.length === 0 && !bye)}
              >
                Quay lại
              </button>
            </div>
          </div>

          <div className={styles.pairsPanel}>
            <h2 className={styles.pairsTitle}>Các cặp đấu</h2>
            <div className={styles.pairsList}>
              {pairs.length === 0 && currentPair.length === 0 && !bye && (
                <div className={styles.pairEmpty}>
                  Chưa có cặp nào — bấm "Quay" để bắt đầu
                </div>
              )}

              {pairs.map(([a, b], i) => (
                <div key={`pair-${i}`} className={styles.pairItem}>
                  <span className={styles.pairIndex}>#{i + 1}</span>
                  <span className={styles.pairTeam}>{a.name}</span>
                  <span className={styles.pairVs}>vs</span>
                  <span className={styles.pairTeam}>{b.name}</span>
                </div>
              ))}

              {currentPair.length === 1 && (
                <div className={`${styles.pairItem} ${styles.pairItemPending}`}>
                  <span className={styles.pairIndex}>#{pairs.length + 1}</span>
                  <span className={styles.pairTeam}>{currentPair[0].name}</span>
                  <span className={styles.pairVs}>vs</span>
                  <span className={styles.pairTeam}>?</span>
                </div>
              )}

              {bye && (
                <div className={`${styles.pairItem} ${styles.pairItemBye}`}>
                  <span className={styles.pairIndex}>BYE</span>
                  <span className={styles.pairTeam}>{bye.name}</span>
                  <span className={styles.pairVs}>—</span>
                  <span className={styles.pairTeam}>tự động đi tiếp</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.buttonGroup}>
          <button onClick={onClose} className={styles.cancelButton}>
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            className={styles.confirmButton}
            disabled={!allDone || nothingToSpin}
            title={
              !allDone
                ? 'Cần quay xong tất cả các cặp trước khi áp dụng'
                : 'Áp dụng các cặp đã chọn vào nhánh đấu'
            }
          >
            Áp dụng vào nhánh đấu
          </button>
        </div>
      </div>
    </div>
  );
}
