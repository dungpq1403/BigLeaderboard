const { encodeId, decodeId } = require('../utils/hashId');

// Tên param trên URL cần decode hash → số nguyên trước khi vào controller.
// Bracket APIs dùng "matchId" là id do FE tự sinh (seedOrder), KHÔNG phải PK
// trong DB → KHÔNG decode. Tương tự groupId/teamAId/teamBId là string nội bộ.
const DECODE_PARAMS = ['id', 'tournamentId', 'gameId', 'userId'];

// Tên field trong response JSON cần encode số → hash khi trả về client.
// Giữ danh sách hẹp & rõ ràng để tránh ngẫu nhiên encode các integer khác như
// roundNumber, bestOf, maxParticipants, ...
const ENCODE_FIELDS = new Set([
  'id',
  'tournamentId',
  'gameId',
  'userId',
  'createdBy',
]);

// Các field chứa payload "đục" (opaque) đến từ API ngoài — không phải DB id của
// hệ thống. KHÔNG đệ quy vào để tránh encode nhầm các `id` nội bộ của payload
// (vd: `profileData.playerInfo.profilePicture.id` là profile picture id của
// HoYoverse / enka.network, FE sẽ truyền lại cho `/enka/avatar/:avatarId` ở
// nguyên trạng số; nếu bị Sqids-encode thành chuỗi hash thì backend nhận
// được sẽ Number(hash) = NaN → 404).
const OPAQUE_KEYS = new Set([
  'profileData',
]);

// Tên field trong request body cần decode hash → số. Áp dụng khi FE gửi
// `gameId`/`userId`/... qua POST/PUT body. Cùng tập với ENCODE_FIELDS để
// round-trip đối xứng: BE encode khi trả ra → FE gửi lại → BE decode lại.
const BODY_DECODE_FIELDS = new Set([
  'id',
  'tournamentId',
  'gameId',
  'userId',
  'createdBy',
]);

// Sinh callback cho router.param: decode 1 param, trả 400 nếu sai format để
// tránh tốn DB query với id rác. Lưu giá trị decoded dưới dạng STRING để
// Sequelize (`findByPk`) và các so sánh `parseInt(req.params.id) === req.user.id`
// cũ tiếp tục chạy.
function makeParamDecoder(name) {
  return (req, res, next, value) => {
    const decoded = decodeId(String(value));
    if (decoded === null) {
      return res.status(400).json({
        message: `Invalid id parameter "${name}".`,
      });
    }
    req.params[name] = String(decoded);
    next();
  };
}

// Đăng ký decoder cho mọi param hash trên 1 router. Dùng router.param() (cách
// Express-idiomatic) vì req.params chỉ được populate SAU khi route matching,
// trong khi router.use() chạy TRƯỚC matching → không thấy params.
function attachIdParamDecoders(router) {
  for (const name of DECODE_PARAMS) {
    router.param(name, makeParamDecoder(name));
  }
}

// Walk recursive xuyên qua object/array, encode các field có tên trong
// ENCODE_FIELDS nếu giá trị là số nguyên không âm. Mutate tại chỗ vì input
// đã là plain object (xem encodeResponseIds bên dưới).
// Subtree dưới OPAQUE_KEYS được bỏ qua hoàn toàn (giữ nguyên payload thô từ
// API ngoài, không encode bất kỳ field `id` nào bên trong).
function encodeIdsInPlace(value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) encodeIdsInPlace(value[i]);
    return;
  }
  if (typeof value !== 'object') return;

  for (const key of Object.keys(value)) {
    if (OPAQUE_KEYS.has(key)) continue;
    const v = value[key];
    if (
      ENCODE_FIELDS.has(key) &&
      typeof v === 'number' &&
      Number.isInteger(v) &&
      v >= 0
    ) {
      value[key] = encodeId(v);
    } else if (v && typeof v === 'object') {
      encodeIdsInPlace(v);
    }
  }
}

// Wrap `res.json` để mọi response JSON đi qua đều được encode id.
// Dùng JSON.parse(JSON.stringify(...)) để:
//   1. Trigger `toJSON()` của Sequelize instance → ra plain object.
//   2. Tách bản clone khỏi reference caller, mutate an toàn không ảnh hưởng caller.
// Express vốn cũng sẽ stringify lại nên overhead chấp nhận được cho payload bình thường.
function encodeResponseIds(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body != null && typeof body === 'object') {
      let cloned;
      try {
        cloned = JSON.parse(JSON.stringify(body));
      } catch {
        return originalJson(body);
      }
      encodeIdsInPlace(cloned);
      return originalJson(cloned);
    }
    return originalJson(body);
  };
  next();
}

// Decode các hash ID nằm ở top-level req.body. Chỉ chấp nhận chuỗi đã encode;
// nếu giá trị là null/undefined thì bỏ qua (vd: optional field). Nếu là chuỗi
// không decode được → 400 để chặn enumeration attack hoặc FE gửi sai format.
// KHÔNG đệ quy vào array/nested object để giữ hành vi rõ ràng — nếu sau này
// có endpoint nhận mảng id, controller tự xử lý cho minh bạch.
function decodeBodyIds(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return next();

  for (const key of Object.keys(body)) {
    if (!BODY_DECODE_FIELDS.has(key)) continue;
    const v = body[key];
    if (v == null) continue;
    if (typeof v !== 'string') {
      return res.status(400).json({
        message: `Field "${key}" in body must be an encoded id string.`,
      });
    }
    const decoded = decodeId(v);
    if (decoded === null) {
      return res.status(400).json({
        message: `Invalid id field "${key}" in body.`,
      });
    }
    body[key] = decoded;
  }
  next();
}

module.exports = {
  attachIdParamDecoders,
  encodeResponseIds,
  decodeBodyIds,
  encodeId,
  decodeId,
};
