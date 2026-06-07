const Sqids = require('sqids').default;

// Salt quyết định thứ tự xáo trộn alphabet → 2 server với salt khác nhau sẽ
// sinh ra hash hoàn toàn khác cho cùng 1 id. ĐỔI salt ở prod (env HASH_ID_SALT).
// Nếu đổi salt sau khi deploy, mọi URL có sẵn (vd: link đã share) sẽ vỡ.
const SALT =
  process.env.HASH_ID_SALT ||
  'bigleaderboard-default-hash-salt-change-me-in-prod';

// Sqids cần alphabet >= 3 ký tự, không trùng. 62 ký tự alphanumeric đủ để hash
// ngắn (id 6 chữ số ~ 5 ký tự). minLength=6 đảm bảo hash trông giống token chứ
// không bị lộ là id nhỏ (vd: id=1 → "a" trông quá ngắn).
const BASE_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MIN_LENGTH = 6;

// Xáo trộn alphabet bằng PRNG có hạt từ salt (Fisher-Yates + LCG đơn giản).
// Lý do tự xáo thay vì truyền nguyên salt: API sqids không nhận salt trực tiếp,
// chỉ nhận alphabet — nên phải tự "trộn" alphabet theo salt để đạt cùng hiệu
// quả như Hashids cổ điển.
function shuffleAlphabet(alphabet, salt) {
  const chars = alphabet.split('');
  let state = djb2(salt) >>> 0;
  for (let i = chars.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

const sqids = new Sqids({
  alphabet: shuffleAlphabet(BASE_ALPHABET, SALT),
  minLength: MIN_LENGTH,
});

// Encode 1 số nguyên không âm thành chuỗi hash. Trả null nếu input không hợp lệ
// để caller chủ động xử lý — tránh throw vì IDs đến từ nhiều nguồn khó kiểm soát.
function encodeId(id) {
  const n = typeof id === 'string' ? Number(id) : id;
  if (!Number.isInteger(n) || n < 0) return null;
  return sqids.encode([n]);
}

// Decode hash → số nguyên. Trả null nếu:
//   - chuỗi không hợp lệ (sai alphabet, sai checksum implicit)
//   - decode ra nhiều số (sqids cho phép encode mảng)
//   - encode lại không khớp (canonical form check — chặn nhiều biến thể cùng
//     decode thành 1 số, tránh enumeration attack qua URL fuzz).
function decodeId(str) {
  if (typeof str !== 'string' || str.length === 0) return null;
  const arr = sqids.decode(str);
  if (!Array.isArray(arr) || arr.length !== 1) return null;
  const n = arr[0];
  if (!Number.isInteger(n) || n < 0) return null;
  if (sqids.encode([n]) !== str) return null;
  return n;
}

module.exports = { encodeId, decodeId };
