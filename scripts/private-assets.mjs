export const isPrivateAssetPath = name => /(^|[\\/])assets-private([\\/]|$)/i.test(name)

export function excludePrivateArt() {
  return {
    name: 'exclude-private-game-art',
    enforce: 'pre',
    load(id) {
      if (isPrivateAssetPath(id.split('?')[0])) this.error('私有游戏素材只能由本机试玩读取')
    },
    generateBundle(_, bundle) {
      if (Object.keys(bundle).some(isPrivateAssetPath)) this.error('构建输出检测到私有游戏素材目录')
    },
  }
}
