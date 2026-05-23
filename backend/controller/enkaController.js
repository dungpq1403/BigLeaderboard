const axios = require('axios');

const PROFILE_PIC_URL =
  'https://gitlab.com/Dimbreath/AnimeGameData/-/raw/master/ExcelBinOutput/ProfilePictureExcelConfigData.json';
let profilePictureMap = null;

async function getProfileIconName(id) {
  if (!profilePictureMap) {
    const { data } = await axios.get(PROFILE_PIC_URL);
    profilePictureMap = new Map(data.map((entry) => [entry.id, entry.iconPath]));
  }
  const iconPath = profilePictureMap.get(Number(id));
  if (!iconPath) return null;
  const match = iconPath.match(/^UI_AvatarIcon_(.+)_Circle$/);
  return match ? `UI_AvatarIcon_Side_${match[1]}` : iconPath;
}

const enkaController = {
  // GET /api/enka/avatar/:avatarId
  async getAvatar(req, res) {
    try {
      const { avatarId } = req.params;
      const iconName = await getProfileIconName(avatarId);
      if (!iconName) {
        return res.status(404).json({ message: 'Avatar not found' });
      }
      const url = `https://enka.network/ui/${iconName}.png`;

      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
      });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      response.data.pipe(res);
    } catch (error) {
      res.status(404).json({ message: 'Avatar not found' });
    }
  },
};

module.exports = enkaController;